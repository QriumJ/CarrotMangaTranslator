import React from "react";
import type { MangaPage } from "../../../shared/libraryTypes";

type PageAction = (
  chapterId: string,
  pageId: string,
  pages: MangaPage[],
) => void;
type RangeAction = (
  chapterId: string,
  anchorPageId: string,
  targetPageId: string,
  pages: MangaPage[],
) => void;

/** Keeps the last ordinary click as the Shift-range anchor for one picker. */
export function usePageRangeAnchor(onPage: PageAction, onRange: RangeAction) {
  const anchorRef = React.useRef<{ chapterId: string; pageId: string } | null>(
    null,
  );
  const reset = React.useCallback(() => {
    anchorRef.current = null;
  }, []);
  const togglePage: PageAction = (chapterId, pageId, pages) => {
    anchorRef.current = { chapterId, pageId };
    onPage(chapterId, pageId, pages);
  };
  const toggleRange: PageAction = (chapterId, pageId, pages) => {
    const anchor = anchorRef.current;
    if (!anchor || anchor.chapterId !== chapterId) {
      togglePage(chapterId, pageId, pages);
      return;
    }
    onRange(chapterId, anchor.pageId, pageId, pages);
  };
  return { reset, togglePage, toggleRange };
}
