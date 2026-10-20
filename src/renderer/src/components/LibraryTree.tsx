import type { LibraryContextActions } from "../hooks/libraryActionTypes";
import React from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type {
  LibraryChapterSummary,
  LibraryIndex,
} from "../../../shared/libraryTypes";
import { useStandardDndSensors } from "../lib/dnd";
import { filterLibraryIndex } from "../lib/libraryFilter";
import { sortLibraryIndex, type LibrarySort } from "../lib/librarySort";
import { useStoredLibrarySort } from "../hooks/useStoredLibrarySort";
import {
  ChapterDragPreview,
  LibraryBulkDisclosureButtons,
  LibraryWorkGroup,
} from "./libraryTreeItems";
import { LibraryPanelHeader } from "./LibraryPanelHeader";
import {
  useLibraryWorkDisclosure,
  type LibraryWorkDisclosure,
} from "./useLibraryWorkDisclosure";

type LibraryTreeProps = {
  collapsed: boolean;
  otherPanelCollapsed: boolean;
  library: LibraryIndex;
  /**
   * Set only when `library` is a successful full read. Until then stored
   * collapse state is never pruned, so a loading or failed read keeps it.
   */
  libraryComplete?: boolean;
  currentChapterId: string | null;
  jobActive: boolean;
  onOpenChapter: (chapterId: string) => void;
  contextActions?: LibraryContextActions;
  onRenameWork: (workId: string) => void;
  onRenameChapter: (chapterId: string) => void;
  onReorderChapter: (
    workId: string,
    sourceChapterId: string,
    targetChapterId: string,
  ) => void;
  onToggleOtherPanel: () => void;
};

type ActiveChapterDrag = {
  workId: string;
  chapter: LibraryChapterSummary;
};

type ChapterDragController = {
  activeDrag: ActiveChapterDrag | null;
  dragEnabled: boolean;
  handleDragCancel: () => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleDragStart: (event: DragStartEvent) => void;
  sensors: ReturnType<typeof useStandardDndSensors>;
};

function LibraryTreeView(props: LibraryTreeProps): React.JSX.Element {
  const {
    contextActions,
    collapsed,
    otherPanelCollapsed,
    library,
    libraryComplete = false,
    currentChapterId,
    jobActive,
    onReorderChapter,
    onToggleOtherPanel,
  } = props;
  const [searchQuery, setSearchQuery] = React.useState("");
  const contentId = React.useId();
  const [sort, handleSortChange] = useStoredLibrarySort();
  const selecting = Boolean(contextActions?.selection.work);
  const visibleLibrary = useVisibleLibrary(
    library,
    selecting ? "" : searchQuery,
    sort,
  );
  const searchActive = searchQuery.trim().length > 0;
  const drag = useChapterDragController({
    jobActive: jobActive || selecting,
    onReorderChapter,
    searchActive,
    visibleLibrary,
  });
  const disclosure = useLibraryWorkDisclosure({
    currentChapterId,
    library,
    libraryComplete,
    searchActive,
  });

  return (
    <section
      className={`library-panel ${collapsed ? "collapsed" : ""}`.trim()}
      data-collapsed={collapsed}
      id="sidebar-library-panel"
    >
      <LibraryPanelHeader
        collapsed={collapsed}
        disclosureActions={
          <LibraryBulkDisclosureButtons
            disclosure={disclosure}
            hasWorks={library.works.length > 0}
          />
        }
        otherPanelCollapsed={otherPanelCollapsed}
        searchDisabled={selecting}
        onSearchChange={setSearchQuery}
        onSortChange={handleSortChange}
        onToggleOtherPanel={onToggleOtherPanel}
        searchQuery={selecting ? "" : searchQuery}
        sort={sort}
      />
      <LibraryTreeContent
        props={props}
        contentId={contentId}
        drag={drag}
        disclosure={disclosure}
        searchActive={searchActive}
        visibleLibrary={visibleLibrary}
      />
    </section>
  );
}

function LibraryTreeContent({
  props,
  contentId,
  drag,
  disclosure,
  searchActive,
  visibleLibrary,
}: {
  props: LibraryTreeProps;
  contentId: string;
  drag: ChapterDragController;
  disclosure: LibraryWorkDisclosure;
  searchActive: boolean;
  visibleLibrary: LibraryIndex;
}) {
  return (
    <div
      className="library-panel-content"
      id={contentId}
      hidden={props.collapsed}
    >
      <DndContext
        sensors={drag.sensors}
        collisionDetection={closestCenter}
        onDragStart={drag.handleDragStart}
        onDragCancel={drag.handleDragCancel}
        onDragEnd={drag.handleDragEnd}
      >
        <LibraryWorksList
          {...props}
          activeDrag={drag.activeDrag}
          disclosure={disclosure}
          dragEnabled={drag.dragEnabled}
          searchActive={searchActive}
          visibleLibrary={visibleLibrary}
        />
        <ChapterDragPortal
          activeDrag={drag.activeDrag}
          currentChapterId={props.currentChapterId}
        />
      </DndContext>
    </div>
  );
}

export const LibraryTree = React.memo(LibraryTreeView);

function useVisibleLibrary(
  library: LibraryIndex,
  searchQuery: string,
  sort: LibrarySort,
): LibraryIndex {
  const { i18n } = useTranslation("components");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const filteredLibrary = React.useMemo(
    () => filterLibraryIndex(library, deferredSearchQuery),
    [deferredSearchQuery, library],
  );
  return React.useMemo(
    () =>
      sortLibraryIndex(
        filteredLibrary,
        sort,
        i18n.resolvedLanguage ?? i18n.language,
      ),
    [filteredLibrary, i18n.language, i18n.resolvedLanguage, sort],
  );
}

function useChapterDragController({
  jobActive,
  onReorderChapter,
  searchActive,
  visibleLibrary,
}: {
  jobActive: boolean;
  onReorderChapter: LibraryTreeProps["onReorderChapter"];
  searchActive: boolean;
  visibleLibrary: LibraryIndex;
}): ChapterDragController {
  const sensors = useStandardDndSensors();
  const [activeDrag, setActiveDrag] = React.useState<ActiveChapterDrag | null>(
    null,
  );
  const dragEnabled = !jobActive && !searchActive;
  const handleDragCancel = React.useCallback(() => setActiveDrag(null), []);
  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      const workId = event.active.data.current?.workId;
      const chapterId = String(event.active.id);
      const work = visibleLibrary.works.find(
        (candidate) => candidate.id === workId,
      );
      const chapter = work?.chapters.find(
        (candidate) => candidate.id === chapterId,
      );
      if (typeof workId === "string" && chapter) {
        setActiveDrag({ workId, chapter });
      }
    },
    [visibleLibrary.works],
  );
  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      setActiveDrag(null);
      if (!event.over || event.active.id === event.over.id || !dragEnabled) {
        return;
      }
      const activeWorkId = event.active.data.current?.workId;
      const overWorkId = event.over.data.current?.workId;
      if (typeof activeWorkId !== "string" || activeWorkId !== overWorkId) {
        return;
      }
      onReorderChapter(
        activeWorkId,
        String(event.active.id),
        String(event.over.id),
      );
    },
    [dragEnabled, onReorderChapter],
  );

  return {
    activeDrag,
    dragEnabled,
    handleDragCancel,
    handleDragEnd,
    handleDragStart,
    sensors,
  };
}

function LibraryWorksList({
  contextActions,
  activeDrag,
  currentChapterId,
  disclosure,
  dragEnabled,
  jobActive,
  onOpenChapter,
  onRenameChapter,
  onRenameWork,
  searchActive,
  visibleLibrary,
}: {
  contextActions?: LibraryContextActions;
  activeDrag: ActiveChapterDrag | null;
  currentChapterId: string | null;
  disclosure: LibraryWorkDisclosure;
  dragEnabled: boolean;
  jobActive: boolean;
  onOpenChapter: LibraryTreeProps["onOpenChapter"];
  onRenameChapter: LibraryTreeProps["onRenameChapter"];
  onRenameWork: LibraryTreeProps["onRenameWork"];
  searchActive: boolean;
  visibleLibrary: LibraryIndex;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div
      className={`library-scroll sortable-scroll ${activeDrag ? "drag-active" : ""}`}
    >
      {visibleLibrary.works.length ? (
        visibleLibrary.works.map((work) => (
          <LibraryWorkGroup
            contextActions={contextActions}
            key={work.id}
            currentChapterId={currentChapterId}
            dragEnabled={dragEnabled}
            expanded={disclosure.isExpanded(work.id)}
            jobActive={jobActive}
            onOpenChapter={onOpenChapter}
            onRenameChapter={onRenameChapter}
            onRenameWork={onRenameWork}
            onToggleExpanded={disclosure.toggleWork}
            work={work}
          />
        ))
      ) : (
        <p className="panel-empty">
          {t(searchActive ? "library.noSearchResults" : "library.empty")}
        </p>
      )}
    </div>
  );
}

function ChapterDragPortal({
  activeDrag,
  currentChapterId,
}: {
  contextActions?: LibraryContextActions;
  activeDrag: ActiveChapterDrag | null;
  currentChapterId: string | null;
}): React.ReactPortal {
  return createPortal(
    <DragOverlay>
      {activeDrag ? (
        <ChapterDragPreview
          chapter={activeDrag.chapter}
          active={activeDrag.chapter.id === currentChapterId}
        />
      ) : null}
    </DragOverlay>,
    document.body,
  );
}
