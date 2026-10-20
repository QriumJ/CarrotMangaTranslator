import { describe, expect, it, vi } from "vitest";
import type { LibraryIndex } from "../src/shared/libraryTypes";
import { deleteChaptersInWork } from "../src/main/application/chapterBatchDeletionService";

const stamp = "2026-10-20T00:00:00.000Z";

function library(chapterIds: string[]): LibraryIndex {
  return {
    workOrder: ["work"],
    works: [
      {
        id: "work",
        title: "작품",
        chapterOrder: chapterIds,
        createdAt: stamp,
        updatedAt: stamp,
        chapters: chapterIds.map((id) => ({
          id,
          workId: "work",
          title: `${id}권`,
          status: "completed",
          pageCount: 3,
          createdAt: stamp,
          updatedAt: stamp,
        })),
      },
    ],
  };
}

function ports(remaining: string[], failing: Record<string, Error> = {}) {
  let current = [...remaining];
  return {
    listLibrary: vi.fn(async () => library(current)),
    deleteChapter: vi.fn(async (chapterId: string) => {
      const failure = failing[chapterId];
      if (failure) throw failure;
      current = current.filter((id) => id !== chapterId);
    }),
    selectionChangedError: () => new Error("changed"),
  };
}

describe("chapter batch deletion", () => {
  it("deletes only the selected chapters in library order", async () => {
    const port = ports(["1", "2", "3", "4"]);
    const result = await deleteChaptersInWork(
      { workId: "work", chapterIds: ["3", "1"], removeCustomOutputs: false },
      port,
    );
    expect(port.deleteChapter.mock.calls).toEqual([
      ["1", false],
      ["3", false],
    ]);
    expect(result.deletedChapterIds).toEqual(["1", "3"]);
    expect(result.failures).toEqual([]);
    expect(result.library.works[0]?.chapters.map((item) => item.id)).toEqual([
      "2",
      "4",
    ]);
  });

  it("rejects a stale or foreign selection before deleting anything", async () => {
    for (const request of [
      { workId: "work", chapterIds: ["1", "gone"] },
      { workId: "other", chapterIds: ["1"] },
    ]) {
      const port = ports(["1", "2"]);
      await expect(
        deleteChaptersInWork({ ...request, removeCustomOutputs: true }, port),
      ).rejects.toThrow("changed");
      expect(port.deleteChapter).not.toHaveBeenCalled();
    }
  });

  it("keeps going after a failed chapter and reports it with its title", async () => {
    const port = ports(["1", "2", "3"], { "2": new Error("busy") });
    const result = await deleteChaptersInWork(
      {
        workId: "work",
        chapterIds: ["1", "2", "3"],
        removeCustomOutputs: true,
      },
      port,
    );
    expect(port.deleteChapter).toHaveBeenCalledTimes(3);
    expect(result.deletedChapterIds).toEqual(["1", "3"]);
    expect(result.failures).toEqual([
      { chapterId: "2", title: "2권", message: "busy" },
    ]);
    expect(result.library.works[0]?.chapters.map((item) => item.id)).toEqual([
      "2",
    ]);
  });

  it("counts a committed deletion whose list refresh failed as deleted", async () => {
    const committed = Object.assign(new Error("list failed"), {
      mutationCommitted: true,
    });
    const port = ports(["1", "2"], { "1": committed });
    const result = await deleteChaptersInWork(
      { workId: "work", chapterIds: ["1"], removeCustomOutputs: false },
      port,
    );
    expect(result.deletedChapterIds).toEqual(["1"]);
    expect(result.failures).toEqual([]);
  });
});
