import React from "react";
import { useTranslation } from "react-i18next";
import type {
  LibraryChapterSummary,
  LibraryWorkSummary,
} from "../../../shared/libraryTypes";
import type { ChapterBulkDeleteController } from "../hooks/chapterBulkDeleteTypes";
import { resolveChapterStatusLabel } from "../lib/chapterStatusLabel";
import { Button } from "./ui/Button";
import { InlineMessage } from "./ui/InlineMessage";
import { SelectionCard } from "./ui/SelectionCard";
import styles from "./ChapterBulkDeleteSelection.module.css";

/** Picks chapters of one work to delete while the work and its terms stay. */
export function ChapterBulkDeleteSelection({
  id,
  heading,
  controller,
  currentChapterId,
  jobActive,
}: {
  id?: string;
  heading?: React.ReactNode;
  controller: ChapterBulkDeleteController & { work: LibraryWorkSummary };
  currentChapterId: string | null;
  jobActive: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const { work, busy, selectedIds } = controller;
  const count = selectedIds.length;
  const selected = new Set(selectedIds);
  const failed = failedIds(controller);
  return (
    <section
      id={id}
      className={styles.body}
      aria-label={t("chapterBulkDelete.title")}
    >
      <div className={styles.selectionControls}>
        {heading}
        <div className={styles.toolbarActions}>
          <Button
            size="sm"
            variant="danger"
            disabled={busy || jobActive || count === 0}
            onClick={() => void controller.submit()}
          >
            {busy
              ? t("chapterBulkDelete.deleting")
              : t("chapterBulkDelete.delete", { count })}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={controller.close}
          >
            {t("common.cancel")}
          </Button>
        </div>
        {jobActive ? (
          <p className={styles.footerNote}>
            {t("chapterBulkDelete.jobActive")}
          </p>
        ) : null}
        <BulkDeleteToolbar controller={controller} />
      </div>
      <BulkDeleteNotices controller={controller} />
      <div
        className={styles.list}
        role="group"
        aria-label={t("chapterBulkDelete.listLabel", { title: work.title })}
        aria-busy={busy || undefined}
      >
        {work.chapters.map((chapter) => (
          <ChapterRow
            key={chapter.id}
            chapter={chapter}
            checked={selected.has(chapter.id)}
            current={chapter.id === currentChapterId}
            disabled={busy || jobActive}
            failed={failed.has(chapter.id)}
            onToggle={controller.toggle}
          />
        ))}
      </div>
    </section>
  );
}

function BulkDeleteNotices({
  controller,
}: {
  controller: ChapterBulkDeleteController & { work: LibraryWorkSummary };
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const { outcome } = controller;
  return (
    <>
      {outcome?.kind === "partial" ? (
        <InlineMessage
          variant="danger"
          title={t("chapterBulkDelete.partialTitle", {
            deleted: outcome.deleted,
            failed: outcome.failures.length,
          })}
          detail={t("chapterBulkDelete.partialDetail")}
        />
      ) : null}
      {outcome?.kind === "failed" ? (
        <InlineMessage
          variant="danger"
          title={t("chapterBulkDelete.failedTitle")}
          detail={t("chapterBulkDelete.failedDetail")}
        />
      ) : null}
    </>
  );
}

function BulkDeleteToolbar({
  controller,
}: {
  controller: ChapterBulkDeleteController & { work: LibraryWorkSummary };
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const { busy, selectedIds, work } = controller;
  const pages = work.chapters
    .filter((chapter) => selectedIds.includes(chapter.id))
    .reduce((total, chapter) => total + chapter.pageCount, 0);
  const allSelected =
    work.chapters.length > 0 && selectedIds.length === work.chapters.length;
  return (
    <div className={styles.toolbar}>
      <span className={styles.count} aria-live="polite">
        {t("chapterBulkDelete.selection", {
          count: selectedIds.length,
          total: work.chapters.length,
          pages,
        })}
      </span>
      <div className={styles.toolbarActions}>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || allSelected}
          onClick={() => controller.setAll(true)}
        >
          {t("common.selectAll")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || selectedIds.length === 0}
          onClick={() => controller.setAll(false)}
        >
          {t("common.clearAll")}
        </Button>
      </div>
    </div>
  );
}

function ChapterRow({
  chapter,
  checked,
  current,
  disabled,
  failed,
  onToggle,
}: {
  chapter: LibraryChapterSummary;
  checked: boolean;
  current: boolean;
  disabled: boolean;
  failed: boolean;
  onToggle: ChapterBulkDeleteController["toggle"];
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const shiftRef = React.useRef(false);
  return (
    <SelectionCard
      className={styles.row}
      variant="row"
      inputType="checkbox"
      checked={checked}
      disabled={disabled}
      inputAriaLabel={t("chapterBulkDelete.selectChapter", {
        title: chapter.title,
      })}
      inputOnClick={(event) => {
        shiftRef.current = event.shiftKey;
      }}
      onChange={(next) => {
        onToggle(chapter.id, next, shiftRef.current);
        shiftRef.current = false;
      }}
    >
      <span className={styles.rowText}>
        <span className={styles.rowTitle} title={chapter.title}>
          {chapter.title}
        </span>
        <small className={styles.rowMeta}>
          {t("common.pageCount", { count: chapter.pageCount })} ·{" "}
          {resolveChapterStatusLabel(chapter.status, t)}
        </small>
      </span>
      {failed ? (
        <span className={styles.tag} data-tone="danger">
          {t("chapterBulkDelete.failedTag")}
        </span>
      ) : current ? (
        <span className={styles.tag}>{t("chapterBulkDelete.currentTag")}</span>
      ) : null}
    </SelectionCard>
  );
}

function failedIds(controller: ChapterBulkDeleteController): Set<string> {
  return new Set(
    controller.outcome?.kind === "partial"
      ? controller.outcome.failures.map((failure) => failure.chapterId)
      : [],
  );
}
