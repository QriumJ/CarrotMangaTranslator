import React from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconArrowsVertical, IconFold } from "@tabler/icons-react";
import type {
  LibraryChapterSummary,
  LibraryIndex,
} from "../../../shared/libraryTypes";
import { IconButton } from "./ui/IconButton";
import { ChevronDownIcon, EditIcon } from "./ui/icons";
import { Button } from "./ui/Button";
import type { LibraryWorkDisclosure } from "./useLibraryWorkDisclosure";
import styles from "./LibraryTree.module.css";

/** Saved-layout bulk actions; search keeps folding transient, so it disables them. */
export function LibraryBulkDisclosureButtons({
  disclosure,
  hasWorks,
}: {
  disclosure: LibraryWorkDisclosure;
  hasWorks: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const searching = disclosure.bulkActionsDisabled;
  const collapseLabel = t(
    searching
      ? "library.collapseAllWorksDuringSearch"
      : "library.collapseAllWorks",
  );
  const expandLabel = t(
    searching ? "library.expandAllWorksDuringSearch" : "library.expandAllWorks",
  );
  return (
    <span className={styles.bulkDisclosure}>
      <IconButton
        size="sm"
        label={collapseLabel}
        onClick={disclosure.collapseAll}
        disabled={searching || !hasWorks || disclosure.allCollapsed}
      >
        <IconFold size={16} stroke={2} aria-hidden="true" />
      </IconButton>
      <IconButton
        size="sm"
        label={expandLabel}
        onClick={disclosure.expandAll}
        disabled={searching || !hasWorks || disclosure.noneCollapsed}
      >
        <IconArrowsVertical size={16} stroke={2} aria-hidden="true" />
      </IconButton>
    </span>
  );
}

type LibraryWorkGroupProps = {
  currentChapterId: string | null;
  dragEnabled: boolean;
  expanded: boolean;
  jobActive: boolean;
  onOpenChapter: (chapterId: string) => void;
  onRenameChapter: (chapterId: string) => void;
  onRenameWork: (workId: string) => void;
  onToggleExpanded: (workId: string) => void;
  work: LibraryIndex["works"][number];
};

/** A work heading that discloses its chapters; reorder stays within a work. */
export function LibraryWorkGroup({
  currentChapterId,
  dragEnabled,
  expanded,
  jobActive,
  onOpenChapter,
  onRenameChapter,
  onRenameWork,
  onToggleExpanded,
  work,
}: LibraryWorkGroupProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const listId = `library-work-${React.useId()}`;
  return (
    <div className="work-group" data-expanded={expanded}>
      <div className="work-row">
        <Button
          variant="bare"
          className={styles.workDisclosure}
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          onClick={() => onToggleExpanded(work.id)}
          title={work.title}
          type="button"
        >
          <ChevronDownIcon
            size={14}
            className={expanded ? styles.chevron : styles.chevronCollapsed}
          />
          <strong>{work.title}</strong>
          {expanded ? null : (
            <small className={styles.collapsedCount}>
              {t("common.chapterCount", { count: work.chapters.length })}
            </small>
          )}
        </Button>
        <IconButton
          size="sm"
          label={t("library.renameItem", { title: work.title })}
          title={t("common.rename")}
          onClick={() => onRenameWork(work.id)}
          disabled={jobActive}
        >
          <EditIcon size={14} />
        </IconButton>
      </div>
      {expanded ? (
        <SortableContext
          items={work.chapters.map((chapter) => chapter.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="chapter-list" id={listId}>
            {work.chapters.map((chapter) => (
              <SortableChapterItem
                key={chapter.id}
                workId={work.id}
                chapter={chapter}
                active={chapter.id === currentChapterId}
                disabled={!dragEnabled}
                jobActive={jobActive}
                onOpenChapter={onOpenChapter}
                onRenameChapter={onRenameChapter}
              />
            ))}
          </div>
        </SortableContext>
      ) : null}
    </div>
  );
}

type SortableChapterItemProps = {
  workId: string;
  chapter: LibraryChapterSummary;
  active: boolean;
  disabled: boolean;
  jobActive: boolean;
  onOpenChapter: (chapterId: string) => void;
  onRenameChapter: (chapterId: string) => void;
};

function SortableChapterItem({
  workId,
  chapter,
  active,
  disabled,
  jobActive,
  onOpenChapter,
  onRenameChapter,
}: SortableChapterItemProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: chapter.id,
    disabled,
    data: {
      type: "chapter",
      workId,
    },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      className={`chapter-item sortable-item ${active ? "active" : ""} ${isDragging ? "dragging" : ""}`}
      style={style}
    >
      <ChapterDragHandle
        attributes={attributes}
        chapterTitle={chapter.title}
        disabled={disabled}
        listeners={listeners}
        setActivatorNodeRef={setActivatorNodeRef}
      />
      <ChapterSelectButton chapter={chapter} onOpenChapter={onOpenChapter} />
      <IconButton
        size="sm"
        label={t("library.renameItem", { title: chapter.title })}
        title={t("common.rename")}
        onClick={() => onRenameChapter(chapter.id)}
        disabled={jobActive}
      >
        <EditIcon size={14} />
      </IconButton>
    </div>
  );
}

function ChapterDragHandle({
  attributes,
  chapterTitle,
  disabled,
  listeners,
  setActivatorNodeRef,
}: {
  attributes: ReturnType<typeof useSortable>["attributes"];
  chapterTitle: string;
  disabled: boolean;
  listeners: ReturnType<typeof useSortable>["listeners"];
  setActivatorNodeRef: ReturnType<typeof useSortable>["setActivatorNodeRef"];
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <Button
      ref={setActivatorNodeRef}
      className="drag-handle compact"
      disabled={disabled}
      aria-label={t("library.moveItem", { title: chapterTitle })}
      title={t(disabled ? "library.moveDisabled" : "common.dragToMove")}
      {...attributes}
      {...listeners}
      variant="bare"
    >
      <span className="drag-grip" aria-hidden="true" />
    </Button>
  );
}

function ChapterSelectButton({
  chapter,
  onOpenChapter,
}: {
  chapter: LibraryChapterSummary;
  onOpenChapter: (chapterId: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <Button
      className="chapter-select"
      onClick={() => onOpenChapter(chapter.id)}
      title={chapter.title}
      variant="bare"
    >
      <span>{chapter.title}</span>
      <small>
        {t("common.pageCount", { count: chapter.pageCount })} ·{" "}
        {resolveChapterStatusLabel(chapter.status, t)}
      </small>
    </Button>
  );
}

export function ChapterDragPreview({
  chapter,
  active,
}: {
  chapter: LibraryChapterSummary;
  active: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div
      className={`chapter-item sortable-item drag-preview ${active ? "active" : ""}`}
    >
      <span className="drag-handle compact preview-handle">
        <span className="drag-grip" aria-hidden="true" />
      </span>
      <div className="chapter-select preview-select" title={chapter.title}>
        <span>{chapter.title}</span>
        <small>
          {t("common.pageCount", { count: chapter.pageCount })} ·{" "}
          {resolveChapterStatusLabel(chapter.status, t)}
        </small>
      </div>
      <span className="library-icon-button preview-edit" aria-hidden="true">
        <EditIcon size={14} />
      </span>
    </div>
  );
}

function resolveChapterStatusLabel(
  status: string,
  t: TFunction<"components">,
): string {
  switch (status) {
    case "completed":
      return t("status.completed");
    case "running":
      return t("common.inProgress");
    case "failed":
      return t("status.failed");
    case "partial":
      return t("status.partiallyCompleted");
    default:
      return t("status.waiting");
  }
}
