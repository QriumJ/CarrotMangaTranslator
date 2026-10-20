import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { LibraryChapter, LibraryWork } from "../src/shared/libraryTypes";
import { deleteChaptersInWork } from "../src/main/application/chapterBatchDeletionService";

const stamp = "2026-01-01T00:00:00.000Z";
const tempDirs: string[] = [];

afterEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

it("deletes the selected chapters through the real library and keeps the work's terms", async () => {
  const root = await seedLibrary(["c1", "c2", "c3"]);
  const guidePath = join(root, "works", "work-1", "style-guide.json");
  const guideBefore = await readFile(guidePath, "utf8");
  const library = await loadLibrary(root);

  const result = await deleteChaptersInWork(
    {
      workId: "work-1",
      chapterIds: ["c3", "c1"],
      removeCustomOutputs: false,
    },
    {
      listLibrary: library.listLibrary,
      deleteChapter: (chapterId) => library.deleteChapter(chapterId),
      selectionChangedError: () => new Error("changed"),
    },
  );

  expect(result.deletedChapterIds).toEqual(["c1", "c3"]);
  expect(result.failures).toEqual([]);
  expect(result.library.works.map((work) => work.id)).toEqual(["work-1"]);
  expect(result.library.works[0]?.chapterOrder).toEqual(["c2"]);
  const chapters = join(root, "works", "work-1", "chapters");
  expect(existsSync(join(chapters, "c1"))).toBe(false);
  expect(existsSync(join(chapters, "c3"))).toBe(false);
  expect(existsSync(join(chapters, "c2", "story-memory.json"))).toBe(true);
  // The accumulated glossary is a work-level file and is not rewritten.
  expect(await readFile(guidePath, "utf8")).toBe(guideBefore);
  expect((await library.getWorkStyleGuide("work-1")).glossary).toHaveLength(1);
});

async function seedLibrary(chapterIds: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "chapter-batch-delete-"));
  tempDirs.push(root);
  await mkdir(join(root, "logs"), { recursive: true });
  const work: LibraryWork = {
    id: "work-1",
    title: "Work",
    chapterOrder: chapterIds,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await writeJson(join(root, "index.json"), { workOrder: [work.id] });
  await mkdir(join(root, "works", work.id), { recursive: true });
  await writeJson(join(root, "works", work.id, "work.json"), work);
  await writeJson(join(root, "works", work.id, "style-guide.json"), {
    schemaVersion: 1,
    workId: work.id,
    glossary: [
      {
        id: "g1",
        source: "魔導院",
        target: "마도원",
        category: "place",
        enabled: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    characters: [],
    rules: {
      prompt: "",
      honorifics: "adapt",
      sfxMode: "translate",
      defaultTone: "natural_korean",
    },
    createdAt: stamp,
    updatedAt: stamp,
  });
  for (const chapterId of chapterIds) await seedChapter(root, chapterId);
  return root;
}

async function seedChapter(root: string, chapterId: string): Promise<void> {
  const chapterRoot = join(root, "works", "work-1", "chapters", chapterId);
  const pagesRoot = join(chapterRoot, "pages");
  await mkdir(pagesRoot, { recursive: true });
  const imagePath = join(pagesRoot, "001-page.png");
  await writeFile(imagePath, makePngHeader(16, 16));
  const chapter: LibraryChapter = {
    id: chapterId,
    workId: "work-1",
    title: `${chapterId}화`,
    sourceKind: "folder",
    status: "completed",
    pageOrder: ["page"],
    pages: [
      {
        id: "page",
        name: "001.png",
        imagePath,
        width: 16,
        height: 16,
        blocks: [],
        analysisStatus: "completed",
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    createdAt: stamp,
    updatedAt: stamp,
  };
  await writeJson(join(chapterRoot, "chapter.json"), chapter);
  await writeJson(join(chapterRoot, "story-memory.json"), {
    schemaVersion: 1,
    workId: "work-1",
    chapterId,
    pages: [],
    updatedAt: stamp,
  });
}

async function loadLibrary(root: string) {
  vi.resetModules();
  vi.doMock("../src/main/appPaths", () => ({
    getAppPaths: () => makeAppPaths(root),
  }));
  expect((await import("../src/main/appPaths")).getAppPaths().libraryDir).toBe(
    root,
  );
  return import("../src/main/library");
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

function makePngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

async function writeJson(path: string, payload: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
