import type {
  DeleteChaptersFailure,
  DeleteChaptersRequest,
  DeleteChaptersResult,
  LibraryIndex,
} from "../../shared/libraryTypes";

export type ChapterBatchDeletionPorts = {
  listLibrary: () => Promise<LibraryIndex>;
  /** The ordinary single-chapter path, including linked output cleanup. */
  deleteChapter: (
    chapterId: string,
    removeCustomOutputs: boolean,
  ) => Promise<unknown>;
  selectionChangedError: () => Error;
};

/**
 * Deletes chapters of one work one at a time through the single-chapter
 * transaction. The work, its terms and every unselected chapter are never part
 * of the request. A failed chapter stays in place and does not stop the rest.
 */
export async function deleteChaptersInWork(
  request: DeleteChaptersRequest,
  ports: ChapterBatchDeletionPorts,
): Promise<DeleteChaptersResult> {
  const titles = await resolveSelectedTitles(request, ports);
  const deletedChapterIds: string[] = [];
  const failures: DeleteChaptersFailure[] = [];
  for (const [chapterId, title] of titles) {
    try {
      await ports.deleteChapter(chapterId, request.removeCustomOutputs);
      deletedChapterIds.push(chapterId);
    } catch (error) {
      if (isCommittedMutation(error)) {
        deletedChapterIds.push(chapterId);
        continue;
      }
      failures.push({ chapterId, title, message: describeError(error) });
    }
  }
  return {
    // A failed refresh rejects; the renderer then rereads the library itself.
    library: await ports.listLibrary(),
    deletedChapterIds,
    failures,
  };
}

/** Rejects the whole request before any deletion when the selection is stale. */
async function resolveSelectedTitles(
  request: DeleteChaptersRequest,
  ports: ChapterBatchDeletionPorts,
): Promise<Map<string, string>> {
  const library = await ports.listLibrary();
  const work = library.works.find(
    (candidate) => candidate.id === request.workId,
  );
  const selected = new Set(request.chapterIds);
  const chapters = (work?.chapters ?? []).filter((chapter) =>
    selected.has(chapter.id),
  );
  if (chapters.length !== selected.size) throw ports.selectionChangedError();
  // Library order keeps the receipt and any partial result predictable.
  return new Map(chapters.map((chapter) => [chapter.id, chapter.title]));
}

function isCommittedMutation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    (error as { mutationCommitted?: unknown }).mutationCommitted === true,
  );
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2000);
}
