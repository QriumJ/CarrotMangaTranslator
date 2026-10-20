/**
 * Checkbox selection over an ordered chapter list. A Shift-click applies the
 * clicked box's new state to every chapter between the last plain click and it.
 */
export function toggleOrderedSelection({
  anchorId,
  checked,
  extend,
  id,
  orderedIds,
  selection,
}: {
  anchorId: string | null;
  checked: boolean;
  extend: boolean;
  id: string;
  orderedIds: readonly string[];
  selection: ReadonlySet<string>;
}): Set<string> {
  const next = new Set(selection);
  const anchorIndex = anchorId === null ? -1 : orderedIds.indexOf(anchorId);
  const targetIndex = orderedIds.indexOf(id);
  const range =
    extend && anchorIndex >= 0 && targetIndex >= 0
      ? orderedIds.slice(
          Math.min(anchorIndex, targetIndex),
          Math.max(anchorIndex, targetIndex) + 1,
        )
      : [id];
  for (const item of range) {
    if (checked) next.add(item);
    else next.delete(item);
  }
  return next;
}

/** Drops chapters that no longer exist, keeping the list order. */
export function presentSelection(
  selection: ReadonlySet<string>,
  orderedIds: readonly string[],
): string[] {
  return orderedIds.filter((id) => selection.has(id));
}
