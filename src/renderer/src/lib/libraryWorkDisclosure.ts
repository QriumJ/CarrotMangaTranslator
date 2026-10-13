import type { LibraryIndex } from "../../../shared/libraryTypes";

export const COLLAPSED_WORK_IDS_STORAGE_KEY = "library.collapsedWorkIds.v1";

const MAX_STORED_WORK_IDS = 5_000;
const MAX_WORK_ID_LENGTH = 200;

/** Stored collapsed work IDs; missing or corrupt storage means all expanded. */
export function readCollapsedWorkIds(): ReadonlySet<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_WORK_IDS_STORAGE_KEY);
    return new Set(
      normalizeCollapsedWorkIds(raw === null ? [] : JSON.parse(raw)),
    );
  } catch (_error) {
    return new Set();
  }
}

export function writeCollapsedWorkIds(ids: ReadonlySet<string>): void {
  try {
    window.localStorage.setItem(
      COLLAPSED_WORK_IDS_STORAGE_KEY,
      JSON.stringify(normalizeCollapsedWorkIds([...ids])),
    );
  } catch (error) {
    void error; // The panel keeps the live disclosure state without storage.
  }
}

export function normalizeCollapsedWorkIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter(
    (entry): entry is string =>
      typeof entry === "string" &&
      entry.length > 0 &&
      entry.length <= MAX_WORK_ID_LENGTH,
  );
  return [...new Set(ids)].slice(-MAX_STORED_WORK_IDS);
}

/**
 * Drops IDs of works that no longer exist. Only call this with a complete,
 * successfully read library: an empty or partial read would erase choices.
 */
export function pruneCollapsedWorkIds(
  ids: ReadonlySet<string>,
  completeLibrary: LibraryIndex,
): ReadonlySet<string> {
  const existing = new Set(completeLibrary.works.map((work) => work.id));
  const kept = [...ids].filter((id) => existing.has(id));
  return kept.length === ids.size ? ids : new Set(kept);
}

export function withoutWorkIds(
  ids: ReadonlySet<string>,
  removed: Iterable<string>,
): ReadonlySet<string> {
  const next = new Set(ids);
  for (const id of removed) next.delete(id);
  return next.size === ids.size ? ids : next;
}

export function toggleWorkId(
  ids: ReadonlySet<string>,
  workId: string,
): ReadonlySet<string> {
  const next = new Set(ids);
  if (!next.delete(workId)) next.add(workId);
  return next;
}

export function collectChapterIds(library: LibraryIndex): Set<string> {
  return new Set(
    library.works.flatMap((work) => work.chapters.map((chapter) => chapter.id)),
  );
}

/** Works that gained a chapter (new work, import or added chapter). */
export function findWorksWithNewChapters(
  library: LibraryIndex,
  knownChapterIds: ReadonlySet<string>,
): string[] {
  return library.works
    .filter((work) =>
      work.chapters.some((chapter) => !knownChapterIds.has(chapter.id)),
    )
    .map((work) => work.id);
}

export function findWorkIdForChapter(
  library: LibraryIndex,
  chapterId: string,
): string | null {
  return (
    library.works.find((work) =>
      work.chapters.some((chapter) => chapter.id === chapterId),
    )?.id ?? null
  );
}
