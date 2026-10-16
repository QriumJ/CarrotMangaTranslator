import React from "react";
import { useWorkspacePreference } from "../hooks/useWorkspacePreference";
import type { SidebarCollapsedPanel } from "../lib/workspacePreferences";

/** Neither panel can be dragged smaller than its header plus a little list. */
const MIN_PANEL_HEIGHT_PX = 120;

type SplitStart = {
  /** Height the two panels' flex-grow shares divide (padding excluded). */
  growable: number;
  libraryHeight: number;
  libraryPadding: number;
  total: number;
};

export type SidebarPanelLayout = {
  collapsedPanel: SidebarCollapsedPanel;
  librarySplit: number | null;
  splitStyle: React.CSSProperties | undefined;
  toggleLibraryContent: () => void;
  togglePageContent: () => void;
  onSplitResizeStart: (handle: HTMLElement) => void;
  onSplitResize: (offsetPx: number) => void;
  onSplitResizeEnd: () => void;
  resetSplit: () => void;
};

/**
 * Collapse state and the dragged library/page split. Collapsing or expanding
 * either panel returns the split to its default proportions.
 */
export function useSidebarPanelLayout(): SidebarPanelLayout {
  const [collapsedPanel, setCollapsedPanel] = useWorkspacePreference(
    "sidebarCollapsedPanel",
  );
  const [librarySplit, setLibrarySplit, commitSplit] = useWorkspacePreference(
    "sidebarLibrarySplit",
    { commitDelayMs: 400 },
  );
  const startRef = React.useRef<SplitStart | null>(null);

  const resetSplit = React.useCallback(
    () => setLibrarySplit(null),
    [setLibrarySplit],
  );

  const toggleLibraryContent = React.useCallback(() => {
    resetSplit();
    setCollapsedPanel((current) => (current === "library" ? null : "library"));
  }, [resetSplit, setCollapsedPanel]);

  const togglePageContent = React.useCallback(() => {
    resetSplit();
    setCollapsedPanel((current) => (current === "pages" ? null : "pages"));
  }, [resetSplit, setCollapsedPanel]);

  // The separator sits between the library panel and the page list.
  const onSplitResizeStart = React.useCallback((handle: HTMLElement) => {
    const library = handle.previousElementSibling;
    const pages = handle.nextElementSibling;
    if (!library || !pages) return;
    const libraryHeight = library.getBoundingClientRect().height;
    const total = libraryHeight + pages.getBoundingClientRect().height;
    const libraryPadding = blockChrome(library);
    startRef.current = {
      growable: total - libraryPadding - blockChrome(pages),
      libraryHeight,
      libraryPadding,
      total,
    };
  }, []);

  const onSplitResize = React.useCallback(
    (offsetPx: number) => {
      const start = startRef.current;
      if (!start || start.growable <= 0) return;
      const libraryHeight = Math.max(
        MIN_PANEL_HEIGHT_PX,
        Math.min(
          start.total - MIN_PANEL_HEIGHT_PX,
          start.libraryHeight + offsetPx,
        ),
      );
      setLibrarySplit((libraryHeight - start.libraryPadding) / start.growable);
    },
    [setLibrarySplit],
  );

  const onSplitResizeEnd = React.useCallback(() => {
    startRef.current = null;
    commitSplit();
  }, [commitSplit]);

  return {
    collapsedPanel,
    librarySplit,
    splitStyle:
      librarySplit === null
        ? undefined
        : ({
            "--sidebar-library-share": librarySplit,
          } as React.CSSProperties),
    toggleLibraryContent,
    togglePageContent,
    onSplitResizeStart,
    onSplitResize,
    onSplitResizeEnd,
    resetSplit,
  };
}

/** Vertical padding and border, which flex-grow shares do not divide. */
function blockChrome(element: Element): number {
  const style = window.getComputedStyle(element);
  return [
    style.paddingTop,
    style.paddingBottom,
    style.borderTopWidth,
    style.borderBottomWidth,
  ].reduce((sum, value) => sum + (Number.parseFloat(value) || 0), 0);
}
