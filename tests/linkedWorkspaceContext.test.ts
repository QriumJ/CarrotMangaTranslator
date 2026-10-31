import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ChapterSnapshot, LibraryIndex } from "../src/shared/libraryTypes";
import { DEFAULT_RASTER_EXPORT_SETTINGS } from "../src/shared/linkedWorkspaceTypes";
import { makeChapter } from "./fixtures/linkedWorkspace";

const boundary = vi.hoisted(() => ({
  openPath: vi.fn(async (_path: string) => ""),
}));
vi.mock("electron", () => ({
  app: { getVersion: () => "3.7.7" },
  shell: { openPath: boundary.openPath },
}));

import { LinkedWorkspaceSyncService } from "../src/main/linkedWorkspace/linkedWorkspaceSyncService";
import { LinkedWorkspaceStore } from "../src/main/linkedWorkspace/linkedWorkspaceStore";

const WORK_A = "11111111-1111-4111-8111-111111111111";
const WORK_B = "55555555-5555-4555-8555-555555555555";
const CHAPTERS = [
  "22222222-2222-4222-8222-222222222222",
  "44444444-4444-4444-8444-444444444444",
  "66666666-6666-4666-8666-666666666666",
];
const roots: string[] = [];
const links: Array<{ path: string; targetFile: string }> = [];
const services: LinkedWorkspaceSyncService[] = [];

afterEach(async () => {
  for (const service of services.splice(0)) await service.dispose();
  for (const link of links.splice(0)) {
    await rm(link.path, { force: true });
    expect(await readFile(link.targetFile, "utf8")).toBe("external original");
  }
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(join(resolve(tmpdir()), "carrot-context-")))
      throw new Error("Refusing to remove a non-fixture root");
    await rm(root, { recursive: true, force: true });
  }
  boundary.openPath.mockClear();
});

async function fixture(count = 1) {
  const dataRoot = await mkdtemp(join(tmpdir(), "carrot-context-"));
  roots.push(dataRoot);
  const chapters = new Map<string, ChapterSnapshot>();
  for (let index = 0; index < count; index++) {
    const chapter = makeChapter();
    chapter.id = CHAPTERS[index];
    chapter.workId = index < 2 ? WORK_A : WORK_B;
    chapter.title = `chapter ${index + 1}`;
    chapter.pages[0].imagePath = join(dataRoot, `${chapter.id}.png`);
    await writeFile(chapter.pages[0].imagePath, `original ${index}`);
    chapters.set(chapter.id, chapter);
  }
  const library: LibraryIndex = {
    workOrder: [WORK_A, WORK_B],
    works: [WORK_A, WORK_B].map((id, index) => {
      const selected = [...chapters.values()].filter(
        (chapter) => chapter.workId === id,
      );
      return {
        id,
        title: `work ${index + 1}`,
        createdAt: "2026-10-31",
        updatedAt: "2026-10-31",
        chapterOrder: selected.map((chapter) => chapter.id),
        chapters: selected.map((chapter) => ({
          id: chapter.id,
          workId: id,
          title: chapter.title,
          status: chapter.status,
          pageCount: chapter.pages.length,
          createdAt: chapter.createdAt,
          updatedAt: chapter.updatedAt,
        })),
      };
    }),
  };
  const renderPage = vi.fn(async () => Buffer.from("generated output"));
  const beforeChapterRead = vi.fn(async (_id: string) => {});
  const createService = () => {
    const service = new LinkedWorkspaceSyncService({
      dataRoot,
      jobs: { hasActive: false } as never,
      decodeImage: async () => null,
      getMainWindow: () => null,
      reportError: vi.fn(),
      dependencies: {
        listLibrary: async () => library,
        openChapter: async (id) => {
          await beforeChapterRead(id);
          const chapter = chapters.get(id);
          if (!chapter) throw new Error("Unknown fixture chapter");
          return chapter;
        },
        updatePagesAfterInpainting: vi.fn(),
        createPageExportRenderSession: async () => ({
          renderPage,
          close: vi.fn(),
          cancel: vi.fn(),
        }),
      },
    });
    services.push(service);
    return service;
  };
  const service = createService();
  await service.initialize();
  for (const chapter of chapters.values()) {
    await service.connect({
      workId: chapter.workId,
      chapterId: chapter.id,
      output: DEFAULT_RASTER_EXPORT_SETTINGS,
      enqueueExistingPages: false,
    });
    await service.viewResults({ chapterId: chapter.id });
  }
  const rootFor = (chapterId: string) => {
    const root = service.getStatus(chapterId).rootPath;
    if (!root) throw new Error("No result root");
    return root;
  };
  return {
    dataRoot,
    service,
    createService,
    chapters,
    library,
    rootFor,
    renderPage,
    beforeChapterRead,
  };
}

it("limits chapter and work repairs to their exact scope and marks only affected chapters busy", async () => {
  const f = await fixture(3);
  const originalRoots = CHAPTERS.map(f.rootFor);
  for (const chapter of f.chapters.values()) chapter.title += " renamed";
  const repair = f.service.organizeManagedResults({
    workId: WORK_A,
    chapterId: CHAPTERS[0],
  });
  expect(f.service.getStatus(CHAPTERS[0]).organization?.state).toBe("moving");
  expect(f.service.getStatus(CHAPTERS[1]).organization?.state).not.toBe(
    "moving",
  );
  expect(f.service.getStatus(CHAPTERS[2]).organization?.state).not.toBe(
    "moving",
  );
  expect(await repair).toMatchObject({ moved: 1, failures: [] });
  expect(f.rootFor(CHAPTERS[0])).not.toBe(originalRoots[0]);
  expect(f.rootFor(CHAPTERS[1])).toBe(originalRoots[1]);
  expect(f.rootFor(CHAPTERS[2])).toBe(originalRoots[2]);
  expect(
    await f.service.organizeManagedResults({ workId: WORK_A }),
  ).toMatchObject({
    moved: 1,
    unchanged: 1,
    failures: [],
  });
  expect(f.rootFor(CHAPTERS[2])).toBe(originalRoots[2]);
  await expect(
    f.service.organizeManagedResults({
      workId: WORK_B,
      chapterId: CHAPTERS[0],
    }),
  ).rejects.toThrow("일치하지 않습니다");
  expect(
    await readFile(join(originalRoots[2], "result", "001.png"), "utf8"),
  ).toBe("generated output");
});

it("persists relocation failures separately from image sync and protects edited bytes across restart and retry", async () => {
  const f = await fixture();
  const oldRoot = f.rootFor(CHAPTERS[0]);
  const output = join(oldRoot, "result", "001.png");
  await writeFile(output, "user edited bytes");
  const chapter = f.chapters.get(CHAPTERS[0]);
  if (!chapter) throw new Error("Missing fixture chapter");
  chapter.title = "new title";
  const target = { workId: WORK_A, chapterId: CHAPTERS[0] };
  const failed = await f.service.organizeManagedResults(target);
  expect(failed.failures).toHaveLength(1);
  expect(f.service.getStatus(CHAPTERS[0])).toMatchObject({
    state: "idle",
    organization: { state: "failed", error: failed.failures[0].message },
  });
  await f.service.dispose();
  const restored = f.createService();
  await restored.initialize();
  expect(restored.getStatus(CHAPTERS[0]).organization).toMatchObject({
    state: "failed",
    error: failed.failures[0].message,
  });
  expect((await restored.organizeManagedResults(target)).failures).toHaveLength(
    1,
  );
  expect(await readFile(output, "utf8")).toBe("user edited bytes");
  await writeFile(output, "generated output");
  expect(await restored.organizeManagedResults(target)).toMatchObject({
    moved: 1,
    failures: [],
  });
  expect(restored.getStatus(CHAPTERS[0]).organization).toMatchObject({
    state: "idle",
  });
  expect(restored.getStatus(CHAPTERS[0]).organization?.error).toBeUndefined();
});

it("keeps and opens the recorded previous folder after restart without touching added user files", async () => {
  const f = await fixture();
  const oldRoot = f.rootFor(CHAPTERS[0]);
  const notes = join(oldRoot, "my-notes.txt");
  await writeFile(notes, "keep me");
  const chapter = f.chapters.get(CHAPTERS[0]);
  if (!chapter) throw new Error("Missing fixture chapter");
  chapter.title = "renamed";
  expect(
    await f.service.organizeManagedResults({ workId: WORK_A }),
  ).toMatchObject({ moved: 1, preserved: 1 });
  await f.service.dispose();
  const restored = f.createService();
  await restored.initialize();
  expect(
    restored.getStatus(CHAPTERS[0]).organization?.preservedRootPaths,
  ).toEqual([oldRoot]);
  boundary.openPath.mockClear();
  expect(
    await restored.openPreservedResults({ chapterId: CHAPTERS[0] }),
  ).toMatchObject({ status: "opened" });
  expect(boundary.openPath).toHaveBeenCalledExactlyOnceWith(oldRoot);
  expect(await readFile(notes, "utf8")).toBe("keep me");
  expect(
    await restored.openPreservedResults({ chapterId: CHAPTERS[0], index: 10 }),
  ).toMatchObject({ status: "failed" });
  expect(boundary.openPath).toHaveBeenCalledTimes(1);
});

it("pauses publication after a relocation conflict while other chapters keep saving", async () => {
  const f = await fixture(3);
  const edited = f.chapters.get(CHAPTERS[0]);
  const unrelated = f.chapters.get(CHAPTERS[2]);
  if (!edited || !unrelated) throw new Error("Missing fixture chapters");
  const output = join(f.rootFor(edited.id), "result", "001.png");
  await writeFile(output, "user edited bytes");
  edited.title = "renamed with a conflict";
  expect(
    (
      await f.service.organizeManagedResults({
        workId: edited.workId,
        chapterId: edited.id,
      })
    ).failures,
  ).toHaveLength(1);
  f.renderPage.mockClear();
  edited.pages[0].blocks[0].translatedText = "updated after conflict";
  await f.service.notifyPagesSaved(edited.id, [edited.pages[0].id], {
    immediate: true,
  });
  expect(await f.service.viewResults({ chapterId: edited.id })).toMatchObject({
    status: "opened",
  });
  expect(f.renderPage).not.toHaveBeenCalled();
  expect(await readFile(output, "utf8")).toBe("user edited bytes");
  expect(f.service.getStatus(edited.id).organization?.state).toBe("failed");

  unrelated.pages[0].blocks[0].translatedText = "unrelated update";
  await f.service.notifyPagesSaved(unrelated.id, [unrelated.pages[0].id], {
    immediate: true,
  });
  expect(
    await f.service.viewResults({ chapterId: unrelated.id }),
  ).toMatchObject({
    status: "opened",
  });
  expect(f.renderPage).toHaveBeenCalledOnce();
  expect(await readFile(output, "utf8")).toBe("user edited bytes");
  expect(
    await readFile(join(f.rootFor(unrelated.id), "result", "001.png"), "utf8"),
  ).toBe("generated output");
});

it("keeps edited files protected when the title is restored before retrying", async () => {
  const f = await fixture();
  const chapter = f.chapters.get(CHAPTERS[0]);
  if (!chapter) throw new Error("Missing fixture chapter");
  const originalTitle = chapter.title;
  const output = join(f.rootFor(chapter.id), "result", "001.png");
  const target = { workId: chapter.workId, chapterId: chapter.id };
  await writeFile(output, "user edited bytes");
  chapter.title = "renamed";
  expect(
    (await f.service.organizeManagedResults(target)).failures,
  ).toHaveLength(1);
  chapter.title = originalTitle;
  await f.service.dispose();
  const restored = f.createService();
  await restored.initialize();
  expect((await restored.organizeManagedResults(target)).failures).toHaveLength(
    1,
  );
  expect(restored.getStatus(chapter.id).organization?.state).toBe("failed");
  f.renderPage.mockClear();
  chapter.pages[0].blocks[0].translatedText = "saved after restoring title";
  await restored.notifyPagesSaved(chapter.id, chapter.pageOrder, {
    immediate: true,
  });
  expect(await restored.viewResults({ chapterId: chapter.id })).toMatchObject({
    status: "opened",
  });
  expect(f.renderPage).not.toHaveBeenCalled();
  expect(await readFile(output, "utf8")).toBe("user edited bytes");
});

it("opens the current folder if organization finishes while result opening reads the chapter", async () => {
  const f = await fixture();
  const chapter = f.chapters.get(CHAPTERS[0]);
  if (!chapter) throw new Error("Missing fixture chapter");
  chapter.title = "renamed";
  let releaseRead!: () => void;
  let startedRead!: () => void;
  const readStarted = new Promise<void>((resolve) => {
    startedRead = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  f.beforeChapterRead.mockImplementationOnce(async () => {
    startedRead();
    await gate;
  });
  boundary.openPath.mockClear();
  const opening = f.service.viewResults({ chapterId: chapter.id });
  await readStarted;
  try {
    expect(
      await f.service.organizeManagedResults({ workId: chapter.workId }),
    ).toMatchObject({ moved: 1 });
  } finally {
    releaseRead();
  }
  expect(await opening).toMatchObject({ status: "opened" });
  expect(boundary.openPath).toHaveBeenCalledExactlyOnceWith(
    join(f.rootFor(chapter.id), "result"),
  );
});

it("keeps conflict protection when the user reselects the current result folder", async () => {
  const f = await fixture();
  const chapter = f.chapters.get(CHAPTERS[0]);
  if (!chapter) throw new Error("Missing fixture chapter");
  const root = f.rootFor(chapter.id);
  const output = join(root, "result", "001.png");
  await writeFile(output, "user edited bytes");
  chapter.title = "renamed";
  expect(
    (await f.service.organizeManagedResults({ workId: chapter.workId }))
      .failures,
  ).toHaveLength(1);
  const connectionId = f.service.getStatus(chapter.id).connectionId;
  if (!connectionId) throw new Error("Missing fixture connection");
  await f.service.reconnect(connectionId, root);
  f.renderPage.mockClear();
  await f.service.viewResults({ chapterId: chapter.id });
  expect(await readFile(output, "utf8")).toBe("user edited bytes");
  expect(f.renderPage).not.toHaveBeenCalled();
  expect(f.service.getStatus(chapter.id).organization?.state).toBe("failed");
});

it.each(["outside", "junction"] as const)(
  "refuses a %s path in preserved-folder metadata",
  async (kind) => {
    const f = await fixture();
    await f.service.dispose();
    const outside = await mkdtemp(join(tmpdir(), "carrot-context-external-"));
    roots.push(outside);
    const targetFile = join(outside, "original.txt");
    await writeFile(targetFile, "external original");
    const link = join(f.dataRoot, "results", "preserved-link");
    if (kind === "junction") {
      await symlink(
        outside,
        link,
        process.platform === "win32" ? "junction" : "dir",
      );
      links.push({ path: link, targetFile });
    }
    const store = new LinkedWorkspaceStore(f.dataRoot);
    const record = (await store.readRegistry()).records[0];
    await store.replaceRecord({
      ...record,
      organization: {
        preservedRootPaths: [kind === "junction" ? link : outside],
      },
    });
    const restored = f.createService();
    await restored.initialize();
    boundary.openPath.mockClear();
    await expect(
      restored.openPreservedResults({ chapterId: CHAPTERS[0] }),
    ).rejects.toThrow();
    expect(boundary.openPath).not.toHaveBeenCalled();
    expect(await readFile(targetFile, "utf8")).toBe("external original");
  },
);

it("can still open existing results when automatic saving is disabled", async () => {
  const f = await fixture();
  const status = f.service.getStatus(CHAPTERS[0]);
  if (!status.connectionId) throw new Error("Missing fixture connection");
  await f.service.update({
    connectionId: status.connectionId,
    enabled: false,
  });
  f.renderPage.mockClear();
  boundary.openPath.mockClear();
  expect(await f.service.viewResults({ chapterId: CHAPTERS[0] })).toMatchObject(
    { status: "opened" },
  );
  expect(boundary.openPath).toHaveBeenCalledExactlyOnceWith(
    join(f.rootFor(CHAPTERS[0]), "result"),
  );
  expect(f.renderPage).not.toHaveBeenCalled();
  expect(f.service.getStatus(CHAPTERS[0]).state).toBe("disabled");
});
