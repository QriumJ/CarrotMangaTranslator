import { existsSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  readdir,
  rm,
  writeFile,
  readFile,
} from "node:fs/promises";
import type {
  ImportTarget,
  CreateImportResult,
} from "../src/shared/importTypes";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ImportImageRuntime } from "../src/main/libraryStore/importImageRuntime";
import type { LibraryTransactionCrashPoint } from "../src/main/libraryStore/libraryTransaction";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("general import transaction recovery", () => {
  it.each(["end", "before", "after"] as const)(
    "adds distinct pages at %s while preserving existing page data and memory",
    async (kind) => {
      const fixture = await createImportFixture();
      const { service, library } = await loadLibrary(fixture.root);
      const first = await service.createImport(makeRequest(fixture.imagePath));
      const chapter = requireChapter(first);
      const original = chapter.pages[0];
      const originalBytes = await readFile(original.imagePath);
      const memory = await library.getChapterStoryMemory(chapter.id);
      await library.saveChapterStoryMemory({
        ...memory,
        pages: [
          {
            pageId: original.id,
            pageName: original.name,
            pageIndex: 0,
            sourceDigest: "원문",
            translatedDigest: "번역",
            summary: "저장된 기억",
            updatedAt: memory.updatedAt,
          },
        ],
      });
      const request = makeRequest(fixture.imagePath, {
        mode: "chapter",
        workId: first.workId,
        chapterId: chapter.id,
        position: kind === "end" ? { kind } : { kind, pageId: original.id },
      });
      request.preview.chapters[0].pages.push({
        ...request.preview.chapters[0].pages[0],
      });
      const added = await service.createImport(request);
      const latest = await library.openChapter(chapter.id);
      expect(added.chapterIds).toEqual([chapter.id]);
      expect(added.addedPageIds).toHaveLength(2);
      expect(new Set(latest.pages.map((page) => page.id)).size).toBe(3);
      expect(new Set(latest.pages.map((page) => page.imagePath)).size).toBe(3);
      expect(latest.pages.map((page) => page.id)).toEqual(
        kind === "before"
          ? [...(added.addedPageIds ?? []), original.id]
          : [original.id, ...(added.addedPageIds ?? [])],
      );
      expect(latest.pages.find((page) => page.id === original.id)).toEqual(
        original,
      );
      expect(await readFile(original.imagePath)).toEqual(originalBytes);
      expect(
        (await library.getChapterStoryMemory(chapter.id)).pages[0],
      ).toMatchObject({
        pageId: original.id,
        summary: "저장된 기억",
        pageIndex: kind === "before" ? 2 : 0,
      });
      expect((await library.listLibrary()).works[0].chapterOrder).toEqual([
        chapter.id,
      ]);
    },
  );

  it("rolls back newly materialized files when a later image fails", async () => {
    const fixture = await createImportFixture();
    const { service, library } = await loadLibrary(fixture.root);
    const first = await service.createImport(makeRequest(fixture.imagePath));
    const chapter = requireChapter(first);
    const directory = join(
      fixture.root,
      "works",
      first.workId,
      "chapters",
      chapter.id,
      "pages",
    );
    const beforeFiles = await readdir(directory);
    const request = makeRequest(fixture.imagePath, {
      mode: "chapter",
      workId: first.workId,
      chapterId: chapter.id,
      position: { kind: "end" },
    });
    request.preview.chapters[0].pages.push({
      ...request.preview.chapters[0].pages[0],
      sourcePath: join(fixture.root, "missing.png"),
    });
    await expect(service.createImport(request)).rejects.toThrow();
    expect(await library.openChapter(chapter.id)).toEqual(chapter);
    expect(await readdir(directory)).toEqual(beforeFiles);
  });

  it("recovers an interrupted append without changing the original chapter", async () => {
    const fixture = await createImportFixture();
    const { service, library, transaction, recovery } = await loadLibrary(
      fixture.root,
    );
    const first = await service.createImport(makeRequest(fixture.imagePath));
    const chapter = requireChapter(first);
    const restore = crashOnceAt(transaction, "after-replace-step");
    try {
      await expect(
        service.createImport(
          makeRequest(fixture.imagePath, {
            mode: "chapter",
            workId: first.workId,
            chapterId: chapter.id,
            position: { kind: "end" },
          }),
        ),
      ).rejects.toBeInstanceOf(transaction.SimulatedLibraryTransactionCrash);
    } finally {
      restore();
    }
    await recovery.recoverLibraryTransactions();
    expect(await library.openChapter(chapter.id)).toEqual(chapter);
    expect((await library.listLibrary()).works[0].chapterOrder).toEqual([
      chapter.id,
    ]);
  });

  it("rejects a foreign chapter or missing anchor without adding files", async () => {
    const fixture = await createImportFixture();
    const { service, library } = await loadLibrary(fixture.root);
    const first = await service.createImport(makeRequest(fixture.imagePath));
    const second = await service.createImport(makeRequest(fixture.imagePath));
    const chapter = requireChapter(first);
    const targets: ImportTarget[] = [
      {
        mode: "chapter",
        workId: second.workId,
        chapterId: chapter.id,
        position: { kind: "end" },
      },
      {
        mode: "chapter",
        workId: first.workId,
        chapterId: chapter.id,
        position: { kind: "before", pageId: "missing" },
      },
    ];
    for (const target of targets)
      await expect(
        service.createImport(makeRequest(fixture.imagePath, target)),
      ).rejects.toThrow();
    expect(await library.openChapter(chapter.id)).toEqual(chapter);
  });

  it.each(["after-publish-step", "after-replace-step"] as const)(
    "removes every trace of a new work after a pre-commit crash at %s",
    async (point) => {
      const fixture = await createImportFixture();
      const { service, library, transaction, recovery } = await loadLibrary(
        fixture.root,
      );
      await library.listLibrary();
      const restoreInjector = crashOnceAt(transaction, point);
      try {
        await expect(
          service.createImport(makeRequest(fixture.imagePath)),
        ).rejects.toBeInstanceOf(transaction.SimulatedLibraryTransactionCrash);
      } finally {
        restoreInjector();
      }

      await recovery.recoverLibraryTransactions();
      expect((await library.listLibrary()).works).toEqual([]);
      expect(await visibleWorkDirectories(fixture.root)).toEqual([]);
    },
  );

  it("restores an existing work chapter order and removes a published new chapter after a pre-commit crash", async () => {
    const fixture = await createImportFixture();
    await seedExistingEmptyWork(fixture.root);
    const { service, library, transaction, recovery } = await loadLibrary(
      fixture.root,
    );
    const restoreInjector = crashOnceAt(transaction, "after-publish-step");
    try {
      await expect(
        service.createImport(
          makeRequest(fixture.imagePath, {
            mode: "existing",
            workId: "work-1",
          }),
        ),
      ).rejects.toBeInstanceOf(transaction.SimulatedLibraryTransactionCrash);
    } finally {
      restoreInjector();
    }

    await recovery.recoverLibraryTransactions();
    const index = await library.listLibrary();
    expect(index.works[0]?.chapterOrder).toEqual([]);
    expect(existsSync(join(fixture.root, "works", "work-1", "chapters"))).toBe(
      true,
    );
    expect(
      await readdir(join(fixture.root, "works", "work-1", "chapters")),
    ).toEqual([]);
  });

  it("keeps the full work, chapter, page, and final published image path after the commit point", async () => {
    const fixture = await createImportFixture();
    const { service, library, transaction, recovery } = await loadLibrary(
      fixture.root,
    );
    await library.listLibrary();
    const restoreInjector = crashOnceAt(transaction, "after-commit-point");
    try {
      await expect(
        service.createImport(makeRequest(fixture.imagePath)),
      ).rejects.toBeInstanceOf(transaction.SimulatedLibraryTransactionCrash);
    } finally {
      restoreInjector();
    }

    await recovery.recoverLibraryTransactions();
    const index = await library.listLibrary();
    expect(index.works).toHaveLength(1);
    const work = index.works[0];
    expect(work?.chapterOrder).toHaveLength(1);
    const chapterId = work?.chapterOrder[0];
    if (!chapterId) {
      throw new Error("Expected imported chapter id");
    }
    const chapter = await library.openChapter(chapterId);
    expect(chapter.pages).toHaveLength(1);
    const imagePath = chapter.pages[0]?.imagePath;
    expect(imagePath).toBeTruthy();
    expect(imagePath).toContain(join("works", work?.id ?? "", "chapters"));
    expect(imagePath).not.toContain(".transactions");
    expect(existsSync(imagePath ?? "")).toBe(true);
  });
});

async function createImportFixture(): Promise<{
  root: string;
  imagePath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "import-transaction-recovery-"));
  tempDirs.push(root);
  await mkdir(join(root, "logs"), { recursive: true });
  const imagePath = join(root, "001.png");
  await writeFile(imagePath, makePngHeader(16, 16));
  return { root, imagePath };
}

async function loadLibrary(root: string) {
  vi.resetModules();
  vi.doMock("../src/main/appPaths", () => ({
    getAppPaths: () => makeAppPaths(root),
  }));
  const library = await import("../src/main/library");
  const transaction =
    await import("../src/main/libraryStore/libraryTransaction");
  const recovery =
    await import("../src/main/libraryStore/libraryTransactionRecovery");
  const image: ImportImageRuntime = {
    validateImageFile: vi.fn(async () => undefined),
    convertWebpToPngFile: vi.fn(async () => {
      throw new Error("unexpected webp conversion");
    }),
  };
  const service = library.createLibraryImportService({
    image,
    runMutation: (operation) => operation(),
  });
  return { service, library, transaction, recovery };
}

function crashOnceAt(
  transaction: typeof import("../src/main/libraryStore/libraryTransaction"),
  point: LibraryTransactionCrashPoint,
): () => void {
  let crashed = false;
  return transaction.setLibraryTransactionCrashInjectorForTests(
    (currentPoint) => {
      if (!crashed && currentPoint === point) {
        crashed = true;
        throw new transaction.SimulatedLibraryTransactionCrash(currentPoint);
      }
    },
  );
}

function makeRequest(
  imagePath: string,
  target: ImportTarget = {
    mode: "new",
    title: "Transactional Work",
  },
) {
  const draftId = "11111111-1111-4111-8111-111111111111";
  return {
    preview: {
      mode: "single" as const,
      sourceKind: "images" as const,
      suggestedWorkTitle: "Transactional Work",
      chapters: [
        {
          draftId,
          title: "1화",
          sourceKind: "images" as const,
          pages: [
            {
              name: "001.png",
              sourceKind: "file" as const,
              sourcePath: imagePath,
            },
          ],
        },
      ],
    },
    target,
    selections: [{ draftId, title: "1화", enabled: true }],
  };
}

async function seedExistingEmptyWork(root: string): Promise<void> {
  await mkdir(join(root, "works", "work-1", "chapters"), { recursive: true });
  await writeFile(
    join(root, "index.json"),
    `${JSON.stringify({ workOrder: ["work-1"] }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "works", "work-1", "work.json"),
    `${JSON.stringify(
      {
        id: "work-1",
        title: "Existing",
        chapterOrder: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function makePngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function makeAppPaths(root: string) {
  return {
    isPackaged: false,
    repoRoot: root,
    executableDir: root,
    resourcesDir: root,
    dataRoot: root,
    settingsPath: join(root, "settings.json"),
    libraryDir: root,
    fontsDir: join(root, "fonts"),
    logsDir: join(root, "logs"),
    logFile: join(root, "logs", "app.log"),
    runtimeDir: join(root, "runtime"),
    toolsDir: join(root, "tools"),
    ocrRuntimeDir: join(root, "ocr-runtime"),
    llamaRuntimeDir: join(root, "tools", "llama"),
    llamaServerPath: join(root, "tools", "llama", "llama-server.exe"),
  };
}

async function visibleWorkDirectories(root: string): Promise<string[]> {
  const worksRoot = join(root, "works");
  if (!existsSync(worksRoot)) {
    return [];
  }
  return (await readdir(worksRoot)).filter(
    (entry) => entry !== ".transactions",
  );
}

function requireChapter(result: CreateImportResult) {
  if (!result.openedChapter) throw new Error("Expected imported chapter");
  return result.openedChapter;
}
