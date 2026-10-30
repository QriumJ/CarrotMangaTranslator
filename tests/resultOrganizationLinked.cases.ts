import { it, expect, vi } from "vitest";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChapterSnapshot, LibraryIndex } from "../src/shared/libraryTypes";
import type { LinkedWorkspaceSyncService } from "../src/main/linkedWorkspace/linkedWorkspaceSyncService";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
type Fixture = {
  makeConnectedService: (mode: "managed" | "custom") => Promise<{
    dataRoot: string;
    root: string;
    service: LinkedWorkspaceSyncService;
  }>;
  createService: (dataRoot: string) => LinkedWorkspaceSyncService;
  requireChapter: () => ChapterSnapshot;
  requireLibrary: () => LibraryIndex;
};
export function registerResultOrganizationLinkedCases({
  makeConnectedService,
  createService,
  requireChapter,
  requireLibrary,
}: Fixture) {
  it("organizes older managed folders, preserves user files, and stays idempotent after restart", async () => {
    vi.useRealTimers();
    const { root, dataRoot, service } = await makeConnectedService("managed");
    try {
      await service.viewResults({ chapterId: CHAPTER_ID });
      const bytes = await readFile(join(root, "result", "001.png"));
      await writeFile(join(root, "notes.txt"), "user notes");
      requireLibrary().works[0].title = "새 작품";
      requireChapter().title = "새 화";
      const result = await service.organizeManagedResults();
      expect(result).toEqual({
        moved: 1,
        unchanged: 0,
        preserved: 1,
        failures: [],
      });
      const next = service.getStatus(CHAPTER_ID).rootPath ?? "missing";
      expect(next).toBe(join(dataRoot, "results", "새 작품", "새 화"));
      expect(await readFile(join(next, "result", "001.png"))).toEqual(bytes);
      expect(await readFile(join(root, "notes.txt"), "utf8")).toBe(
        "user notes",
      );
      expect(await service.organizeManagedResults()).toMatchObject({
        moved: 0,
        unchanged: 1,
        failures: [],
      });
      await service.dispose();
      const restarted = createService(dataRoot);
      try {
        await restarted.initialize();
        expect(restarted.getStatus(CHAPTER_ID).rootPath).toBe(next);
        expect(await restarted.organizeManagedResults()).toMatchObject({
          moved: 0,
          unchanged: 1,
        });
        await restarted.viewResults({ chapterId: CHAPTER_ID });
        expect(await readdir(root)).toEqual(["notes.txt"]);
      } finally {
        await restarted.dispose();
      }
    } finally {
      await service.dispose();
    }
  });

  it("keeps custom locations and modified managed outputs unchanged", async () => {
    vi.useRealTimers();
    const custom = await makeConnectedService("custom");
    try {
      requireLibrary().works[0].title = "renamed";
      expect(await custom.service.organizeManagedResults()).toMatchObject({
        moved: 0,
        failures: [],
      });
      expect(custom.service.getStatus(CHAPTER_ID).rootPath).toBe(custom.root);
    } finally {
      await custom.service.dispose();
    }
    requireLibrary().works[0].title = "테스트 작품";
    const managed = await makeConnectedService("managed");
    try {
      await managed.service.viewResults({ chapterId: CHAPTER_ID });
      await writeFile(
        join(managed.root, "result", "001.png"),
        "user modified output",
      );
      requireLibrary().works[0].title = "renamed";
      const result = await managed.service.organizeManagedResults();
      expect(result.failures).toHaveLength(1);
      expect(managed.service.getStatus(CHAPTER_ID).rootPath).toBe(managed.root);
      expect(
        await readFile(join(managed.root, "result", "001.png"), "utf8"),
      ).toBe("user modified output");
    } finally {
      await managed.service.dispose();
    }
  });

  it("serializes repeated title notifications and preserves an occupied destination", async () => {
    vi.useRealTimers();
    const { root, dataRoot, service } = await makeConnectedService("managed");
    try {
      await service.viewResults({ chapterId: CHAPTER_ID });
      requireChapter().title = "new";
      const occupied = join(dataRoot, "results", "테스트 작품", "new");
      await mkdir(occupied);
      await writeFile(join(occupied, "notes.txt"), "keep");
      const results = await Promise.all([
        service.organizeManagedResults(),
        service.organizeManagedResults(),
      ]);
      expect(results.map((result) => result.moved)).toEqual([1, 0]);
      expect(results.flatMap((result) => result.failures)).toEqual([]);
      expect(service.getStatus(CHAPTER_ID).rootPath).toBe(`${occupied} (2)`);
      expect(await readFile(join(occupied, "notes.txt"), "utf8")).toBe("keep");
      await expect(readdir(root)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await service.dispose();
    }
  });

  it("preserves a result folder when the library still uses a file inside it as an original", async () => {
    vi.useRealTimers();
    const { root, service } = await makeConnectedService("managed");
    try {
      await service.viewResults({ chapterId: CHAPTER_ID });
      const original = join(root, "result", "001.png");
      const bytes = await readFile(original);
      requireChapter().pages[0].imagePath = original;
      requireChapter().title = "renamed";
      const result = await service.organizeManagedResults();
      expect(result.moved).toBe(0);
      expect(result.failures[0]?.message).toContain("원본으로 사용하는 파일");
      expect(service.getStatus(CHAPTER_ID).rootPath).toBe(root);
      expect(await readFile(original)).toEqual(bytes);
    } finally {
      await service.dispose();
    }
  });

  it("waits for a title relocation before opening results", async () => {
    vi.useRealTimers();
    const { root, service } = await makeConnectedService("managed");
    let relocation: Promise<unknown> | undefined;
    try {
      await service.viewResults({ chapterId: CHAPTER_ID });
      requireChapter().title = "new";
      let moved = false;
      relocation = service.organizeManagedResults().then((result) => {
        moved = result.moved === 1;
      });
      expect(
        await service.viewResults({ chapterId: CHAPTER_ID }),
      ).toMatchObject({
        status: "opened",
      });
      expect(moved).toBe(true);
      await expect(readdir(root)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await relocation;
      await service.dispose();
    }
  });
}
