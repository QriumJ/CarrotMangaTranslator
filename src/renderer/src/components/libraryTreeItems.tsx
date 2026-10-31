import { buildWorkContextCommand } from "../lib/workContextCommand";
import type { LibraryContextActions } from "../hooks/libraryActionTypes";
import { ChapterBulkDeleteSelection } from "./ChapterBulkDeleteSelection";
import { ActionMenu } from "./ui/ActionMenu";
import React from "react";
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
import {
  buildChapterResultMenuItems,
  buildWorkResultMenuItems,
  resolveChapterResultIssue,
} from "../lib/libraryResultMenuItems";
import { ChapterRowMeta, WorkResultIssueCount } from "./libraryTreeResults";

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
  contextActions?: LibraryContextActions;
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
  contextActions,
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
  const selection = contextActions?.selection;
  const selecting = selection?.work?.id === work.id;
  const actionsBlocked = jobActive || Boolean(selection?.busy);
  const listId = `library-work-${React.useId()}`;
  const heading = (
    <LibraryWorkHeader
      work={work}
      expanded={expanded || selecting}
      selecting={selecting}
      controlsId={listId}
      onToggleExpanded={onToggleExpanded}
      issueCount={
        <WorkResultIssueCount results={contextActions?.results} work={work} />
      }
      actions={
        <LibraryWorkMenu
          work={work}
          contextActions={contextActions}
          onRenameWork={onRenameWork}
          disabled={actionsBlocked}
        />
      }
    />
  );
  return (
    <div className="work-group" data-expanded={expanded}>
      {selecting && selection?.work ? (
        <ChapterBulkDeleteSelection
          heading={heading}
          id={listId}
          controller={{ ...selection, work: selection.work }}
          currentChapterId={currentChapterId}
          jobActive={jobActive}
        />
      ) : (
        <>
          {heading}
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
                    onDeleteChapter={contextActions?.deleteTarget}
                    results={contextActions?.results}
                  />
                ))}
              </div>
            </SortableContext>
          ) : null}
        </>
      )}
    </div>
  );
}

function LibraryWorkHeader({
  work,
  expanded,
  selecting,
  controlsId,
  onToggleExpanded,
  actions,
  issueCount,
}: Pick<LibraryWorkGroupProps, "work" | "expanded" | "onToggleExpanded"> & {
  selecting: boolean;
  controlsId: string;
  actions: React.ReactNode;
  issueCount: React.ReactNode;
}) {
  const { t } = useTranslation("components");
  return (
    <div className="work-row">
      <Button
        variant="bare"
        className={styles.workDisclosure}
        aria-expanded={selecting || expanded}
        disabled={selecting}
        aria-controls={selecting || expanded ? controlsId : undefined}
        onClick={() => onToggleExpanded(work.id)}
        title={work.title}
        type="button"
      >
        <ChevronDownIcon
          size={14}
          className={expanded ? styles.chevron : styles.chevronCollapsed}
        />
        <strong>{work.title}</strong>
        {issueCount}
        {expanded ? null : (
          <small className={styles.collapsedCount}>
            {t("common.chapterCount", { count: work.chapters.length })}
          </small>
        )}
      </Button>
      {actions}
    </div>
  );
}

function LibraryWorkMenu({
  work,
  contextActions,
  onRenameWork,
  disabled,
}: Pick<LibraryWorkGroupProps, "work" | "contextActions" | "onRenameWork"> & {
  disabled: boolean;
}) {
  const { t } = useTranslation("components");
  const selection = contextActions?.selection;
  return (
    <ActionMenu
      iconOnly
      label={t("library.itemActions", { title: work.title })}
      showTooltip={false}
      disabled={disabled}
      items={[
        {
          ...buildWorkContextCommand(work.id, contextActions?.openContext, t),
          disabled: !contextActions,
        },
        {
          label: t("library.selectChapters"),
          run: () => selection?.open(work.id),
          disabled: !selection || !work.chapters.length,
        },
        { label: t("common.rename"), run: () => onRenameWork(work.id) },
        ...buildWorkResultMenuItems(contextActions?.results, work, t),
        {
          label: t("rename.deleteWork"),
          run: () =>
            contextActions?.deleteTarget({
              kind: "work",
              id: work.id,
              title: work.title,
            }),
          disabled: !contextActions,
          destructive: true,
        },
      ]}
    />
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
  onDeleteChapter?: LibraryContextActions["deleteTarget"];
  results?: LibraryContextActions["results"];
};

function SortableChapterItem({
  onDeleteChapter,
  results,
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
  const style = { transform: CSS.Transform.toString(transform), transition };
  const resultItems = buildChapterResultMenuItems(results, workId, chapter, t);

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
      <ChapterSelectButton
        chapter={chapter}
        issue={resolveChapterResultIssue(results, workId, chapter.id)}
        onOpenChapter={onOpenChapter}
      />
      <ActionMenu
        iconOnly
        label={t("library.itemActions", { title: chapter.title })}
        showTooltip={false}
        disabled={jobActive}
        items={[
          ...resultItems.leading,
          { label: t("common.rename"), run: () => onRenameChapter(chapter.id) },
          ...resultItems.repair,
          {
            label: t("rename.deleteChapter"),
            run: () =>
              onDeleteChapter?.({
                kind: "chapter",
                id: chapter.id,
                title: chapter.title,
              }),
            disabled: !onDeleteChapter,
            destructive: true,
          },
        ]}
      />
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
  issue,
  onOpenChapter,
}: {
  chapter: LibraryChapterSummary;
  issue: React.ComponentProps<typeof ChapterRowMeta>["issue"];
  onOpenChapter: (chapterId: string) => void;
}): React.JSX.Element {
  return (
    <Button
      className="chapter-select"
      onClick={() => onOpenChapter(chapter.id)}
      title={chapter.title}
      variant="bare"
    >
      <span>{chapter.title}</span>
      <ChapterRowMeta chapter={chapter} issue={issue} />
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
  return (
    <div
      className={`chapter-item sortable-item drag-preview ${active ? "active" : ""}`}
    >
      <span className="drag-handle compact preview-handle">
        <span className="drag-grip" aria-hidden="true" />
      </span>
      <div className="chapter-select preview-select" title={chapter.title}>
        <span>{chapter.title}</span>
        <ChapterRowMeta chapter={chapter} issue={null} />
      </div>
      <span className="library-icon-button preview-edit" aria-hidden="true">
        <EditIcon size={14} />
      </span>
    </div>
  );
}
