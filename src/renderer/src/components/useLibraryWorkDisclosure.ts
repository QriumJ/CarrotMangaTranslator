import React from "react";
import type { LibraryIndex } from "../../../shared/libraryTypes";
import {
  collectChapterIds,
  findWorkIdForChapter,
  findWorksWithNewChapters,
  pruneCollapsedWorkIds,
  readCollapsedWorkIds,
  toggleWorkId,
  withoutWorkIds,
  writeCollapsedWorkIds,
} from "../lib/libraryWorkDisclosure";

type CollapsedIds = ReadonlySet<string>;
type SetCollapsedIds = React.Dispatch<React.SetStateAction<CollapsedIds>>;

export type LibraryWorkDisclosure = {
  isExpanded: (workId: string) => boolean;
  toggleWork: (workId: string) => void;
  collapseAll: () => void;
  expandAll: () => void;
  /** Bulk actions only change the saved layout, so search disables them. */
  bulkActionsDisabled: boolean;
  allCollapsed: boolean;
  noneCollapsed: boolean;
};

const EMPTY_IDS: CollapsedIds = new Set();

/**
 * Per-work disclosure for the library tree. The saved collapse set is the
 * user's layout; an active search expands its matches and keeps any folding
 * transient, so clearing the search shows the saved layout again.
 */
export function useLibraryWorkDisclosure({
  currentChapterId,
  library,
  libraryComplete,
  searchActive,
}: {
  currentChapterId: string | null;
  /** The whole library, never the search-filtered view. */
  library: LibraryIndex;
  /** True only when `library` is a successful full read; enables pruning. */
  libraryComplete: boolean;
  searchActive: boolean;
}): LibraryWorkDisclosure {
  const [collapsedIds, setCollapsedIds] = useStoredCollapsedIds();
  const [searchFolding, setSearchFolding] = useSearchFolding(searchActive);
  const reveal = React.useCallback(
    (workIds: string[]) => {
      setCollapsedIds((current) => withoutWorkIds(current, workIds));
      setSearchFolding((current) => withoutWorkIds(current, workIds));
    },
    [setCollapsedIds, setSearchFolding],
  );
  useRevealNavigatedWork(currentChapterId, library, reveal);
  useRevealWorksWithNewChapters(library, reveal);
  React.useEffect(() => {
    if (libraryComplete) {
      setCollapsedIds((current) => pruneCollapsedWorkIds(current, library));
    }
  }, [library, libraryComplete, setCollapsedIds]);

  const visibleFolding = searchActive ? searchFolding : collapsedIds;
  const workIds = library.works.map((work) => work.id);
  return {
    isExpanded: (workId) => !visibleFolding.has(workId),
    toggleWork: (workId) =>
      (searchActive ? setSearchFolding : setCollapsedIds)((current) =>
        toggleWorkId(current, workId),
      ),
    collapseAll: () => {
      if (!searchActive) setCollapsedIds(new Set(workIds));
    },
    expandAll: () => {
      if (!searchActive) setCollapsedIds(EMPTY_IDS);
    },
    bulkActionsDisabled: searchActive,
    allCollapsed: workIds.every((id) => collapsedIds.has(id)),
    noneCollapsed: !workIds.some((id) => collapsedIds.has(id)),
  };
}

function useStoredCollapsedIds(): readonly [CollapsedIds, SetCollapsedIds] {
  const [collapsedIds, setCollapsedIds] =
    React.useState<CollapsedIds>(readCollapsedWorkIds);
  const writtenRef = React.useRef(collapsedIds);
  React.useEffect(() => {
    if (writtenRef.current === collapsedIds) return;
    writtenRef.current = collapsedIds;
    writeCollapsedWorkIds(collapsedIds);
  }, [collapsedIds]);
  return [collapsedIds, setCollapsedIds] as const;
}

/** Folding during a search starts fresh each time a search begins. */
function useSearchFolding(
  searchActive: boolean,
): readonly [CollapsedIds, SetCollapsedIds] {
  const [session, setSession] = React.useState({
    active: searchActive,
    folded: EMPTY_IDS,
  });
  if (session.active !== searchActive) {
    setSession({ active: searchActive, folded: EMPTY_IDS });
  }
  const setFolded = React.useCallback<SetCollapsedIds>((action) => {
    setSession((current) => {
      const folded =
        typeof action === "function" ? action(current.folded) : action;
      return folded === current.folded ? current : { ...current, folded };
    });
  }, []);
  return [session.folded, setFolded] as const;
}

/** Opening a different chapter reveals its work once the library lists it. */
function useRevealNavigatedWork(
  currentChapterId: string | null,
  library: LibraryIndex,
  reveal: (workIds: string[]) => void,
): void {
  const previousChapterIdRef = React.useRef(currentChapterId);
  const pendingChapterIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (currentChapterId !== previousChapterIdRef.current) {
      previousChapterIdRef.current = currentChapterId;
      pendingChapterIdRef.current = currentChapterId;
    }
    const pending = pendingChapterIdRef.current;
    const workId = pending ? findWorkIdForChapter(library, pending) : null;
    if (!workId) return;
    pendingChapterIdRef.current = null;
    reveal([workId]);
  }, [currentChapterId, library, reveal]);
}

/**
 * A work that gains a chapter after the first non-empty library (a new or
 * imported work, or added chapters) is revealed. Refreshes that only change
 * status or order add no chapter IDs and leave the layout alone.
 */
function useRevealWorksWithNewChapters(
  library: LibraryIndex,
  reveal: (workIds: string[]) => void,
): void {
  const knownChapterIdsRef = React.useRef<ReadonlySet<string> | null>(null);
  React.useEffect(() => {
    if (library.works.length === 0) return;
    const known = knownChapterIdsRef.current;
    knownChapterIdsRef.current = collectChapterIds(library);
    if (!known) return;
    const gained = findWorksWithNewChapters(library, known);
    if (gained.length) reveal(gained);
  }, [library, reveal]);
}
