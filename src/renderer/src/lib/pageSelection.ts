import type { MangaPage } from "../../../shared/libraryTypes";

/**
 * Shared chapter/page selection core.
 *
 * Binary page jobs share the checked-page and range rules here. Translation
 * keeps its restart/resume cycle in translationSelection and uses the same
 * explicit chapter checkbox setter.
 */

export type TriState = "none" | "some" | "all";

/**
 * Per-chapter selection state.
 * - `all` / `pending` are coarse markers that need no page loading.
 * - `pages` is an explicit subset the user built by ticking individual pages.
 * A chapter absent from the map is not selected.
 */
export type PageSelection =
  | { kind: "all" }
  | { kind: "pending" }
  | { kind: "pages"; pageIds: Set<string> };

export type BinaryPageSelection = Exclude<PageSelection, { kind: "pending" }>;
export type BinaryPageSelectionMap = Map<string, BinaryPageSelection>;

export type PageSelectionMap<TSelection extends PageSelection> = Map<
  string,
  TSelection
>;

function pendingPageIds(pages: MangaPage[]): string[] {
  return pages
    .filter((page) => page.analysisStatus !== "completed")
    .map((page) => page.id);
}

/** The set of page ids that should render as checked for a chapter. */
export function resolveSelectedPageIds(
  selection: PageSelection | undefined,
  pages: MangaPage[],
): Set<string> {
  if (!selection) return new Set();
  if (selection.kind === "all") return new Set(pages.map((page) => page.id));
  if (selection.kind === "pending") return new Set(pendingPageIds(pages));
  return new Set(selection.pageIds);
}

/** Tri-state for a chapter's own checkbox. Uses loaded pages when available. */
export function resolveChapterTriState(
  selection: PageSelection | undefined,
  pageCount: number,
  loadedPages?: MangaPage[],
): TriState {
  if (!selection) return "none";
  if (selection.kind === "all") return "all";
  if (selection.kind === "pending") {
    return resolvePendingTriState(loadedPages);
  }
  const count = selection.pageIds.size;
  if (count === 0) return "none";
  const total = loadedPages ? loadedPages.length : pageCount;
  return count >= total && total > 0 ? "all" : "some";
}

function resolvePendingTriState(
  loadedPages: MangaPage[] | undefined,
): TriState {
  if (!loadedPages) return "some";
  const pending = pendingPageIds(loadedPages).length;
  if (pending === 0) return "none";
  return pending === loadedPages.length ? "all" : "some";
}

/**
 * Set a whole chapter from the checkbox's next checked value.
 *
 * The rendered tri-state can be "all" even when the stored kind is `pages`,
 * so the caller passes the checkbox value instead of inferring it from kind.
 */
export function setChapterSelection<TSelection extends PageSelection>(
  map: PageSelectionMap<TSelection>,
  chapterId: string,
  selectAll: TSelection,
  checked: boolean,
): PageSelectionMap<TSelection> {
  const next = new Map(map);
  if (checked) {
    next.set(chapterId, selectAll);
  } else {
    next.delete(chapterId);
  }
  return next;
}

/**
 * Toggle a single page. Seeds an explicit page set from whatever currently
 * renders as checked, so touching one page in an `all`/`pending` chapter keeps
 * the rest, then flips the given page. An empty result deselects the chapter.
 */
export function togglePageSelection<TSelection extends PageSelection>(
  map: PageSelectionMap<TSelection>,
  chapterId: string,
  pageId: string,
  pages: MangaPage[],
  {
    collapseFullPageSetToAll = false,
    selectAll,
  }: {
    /** Binary jobs collapse a fully ticked chapter to `all`; translation keeps the explicit set. */
    collapseFullPageSetToAll?: boolean;
    selectAll: TSelection;
  },
): PageSelectionMap<TSelection> {
  const seed = resolveSelectedPageIds(map.get(chapterId), pages);
  if (seed.has(pageId)) {
    seed.delete(pageId);
  } else {
    seed.add(pageId);
  }

  return replacePageSelection(map, chapterId, seed, pages, {
    collapseFullPageSetToAll,
    selectAll,
  });
}

/** Applies the anchor's checked state to an inclusive range in page order. */
export function applyPageRangeSelection<TSelection extends PageSelection>(
  map: PageSelectionMap<TSelection>,
  chapterId: string,
  anchorPageId: string,
  targetPageId: string,
  pages: MangaPage[],
  options: {
    collapseFullPageSetToAll?: boolean;
    selectAll: TSelection;
  },
): PageSelectionMap<TSelection> {
  const anchorIndex = pages.findIndex((page) => page.id === anchorPageId);
  const targetIndex = pages.findIndex((page) => page.id === targetPageId);
  if (anchorIndex < 0 || targetIndex < 0) return map;

  const selected = resolveSelectedPageIds(map.get(chapterId), pages);
  const include = selected.has(anchorPageId);
  const first = Math.min(anchorIndex, targetIndex);
  const last = Math.max(anchorIndex, targetIndex);
  for (const page of pages.slice(first, last + 1)) {
    if (include) selected.add(page.id);
    else selected.delete(page.id);
  }
  return replacePageSelection(map, chapterId, selected, pages, options);
}

function replacePageSelection<TSelection extends PageSelection>(
  map: PageSelectionMap<TSelection>,
  chapterId: string,
  seed: Set<string>,
  pages: MangaPage[],
  {
    collapseFullPageSetToAll = false,
    selectAll,
  }: {
    collapseFullPageSetToAll?: boolean;
    selectAll: TSelection;
  },
): PageSelectionMap<TSelection> {
  const next = new Map(map);
  if (seed.size === 0) {
    next.delete(chapterId);
    return next;
  }
  if (
    collapseFullPageSetToAll &&
    pages.length > 0 &&
    seed.size === pages.length
  ) {
    next.set(chapterId, selectAll);
    return next;
  }
  next.set(chapterId, {
    kind: "pages",
    pageIds: orderPageIds(seed, pages),
  } as TSelection);
  return next;
}

/** Keeps explicit page sets in page order so requests are reproducible. */
function orderPageIds(selected: Set<string>, pages: MangaPage[]): Set<string> {
  return new Set(
    pages.filter((page) => selected.has(page.id)).map((page) => page.id),
  );
}

/** Request mode for one chapter, in the shape both job contracts accept. */
export type ChapterSelectionRequest<TMode extends string> =
  | { chapterId: string; mode: TMode }
  | { chapterId: string; mode: "page-set"; pageIds: string[] };

/**
 * Builds request entries in the given (library) chapter order, dropping empty
 * page sets so a request never asks for zero pages.
 */
export function buildChapterSelectionRequests<
  TSelection extends PageSelection,
  TMode extends string,
>(
  chapterOrder: string[],
  map: PageSelectionMap<TSelection>,
  resolveMode: (selection: TSelection) => TMode | null,
): ChapterSelectionRequest<TMode>[] {
  const result: ChapterSelectionRequest<TMode>[] = [];
  for (const chapterId of chapterOrder) {
    const selection = map.get(chapterId);
    if (!selection) continue;
    if (selection.kind === "pages") {
      if (selection.pageIds.size > 0) {
        result.push({
          chapterId,
          mode: "page-set",
          pageIds: [...selection.pageIds],
        });
      }
      continue;
    }
    const mode = resolveMode(selection);
    if (mode) result.push({ chapterId, mode });
  }
  return result;
}
