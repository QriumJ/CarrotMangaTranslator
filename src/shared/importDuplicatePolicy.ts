import type { ImportChapterDraft, ImportCreateSelection } from "./importTypes";

/** Match the existing title rule: trim only, with exact case-sensitive equality. */
export function findDuplicateImportChapters(
  chapters: readonly ImportChapterDraft[],
  selections: readonly ImportCreateSelection[],
  existingTitles: readonly string[],
  fallbackTitle: string,
): Array<{ draftId: string; title: string }> {
  const used = new Set(existingTitles);
  const selected = new Map(
    selections.map((selection) => [selection.draftId, selection]),
  );
  const skipped: Array<{ draftId: string; title: string }> = [];
  for (const chapter of chapters) {
    const selection = selected.get(chapter.draftId);
    if (!selection?.enabled || chapter.pages.length === 0) continue;
    const title = (selection.title || chapter.title).trim() || fallbackTitle;
    if (used.has(title)) skipped.push({ draftId: chapter.draftId, title });
    else used.add(title);
  }
  return skipped;
}
