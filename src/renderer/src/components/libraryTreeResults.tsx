import React from "react";
import { useTranslation } from "react-i18next";
import { IconAlertTriangle } from "@tabler/icons-react";
import type {
  LibraryChapterSummary,
  LibraryIndex,
} from "../../../shared/libraryTypes";
import { resolveChapterStatusLabel } from "../lib/chapterStatusLabel";
import {
  countWorkResultProblems,
  type LibraryResultActions,
} from "../lib/libraryResultMenuItems";
import type { LinkedResultIssue } from "../lib/linkedResultsCommands";
import styles from "./LibraryTree.module.css";

/** A result-folder state replaces the page meta only while it needs attention. */
export function ChapterRowMeta({
  chapter,
  issue,
}: {
  chapter: LibraryChapterSummary;
  issue: LinkedResultIssue | null;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return issue ? (
    <small className={styles.resultIssue} data-result-issue={issue}>
      {t(`linkedResults.issue.${issue}`)}
    </small>
  ) : (
    <small>
      {t("common.pageCount", { count: chapter.pageCount })} ·{" "}
      {resolveChapterStatusLabel(chapter.status, t)}
    </small>
  );
}

/** Failures stay findable while a work is collapsed or scrolled away. */
export function WorkResultIssueCount({
  results,
  work,
}: {
  results: LibraryResultActions | undefined;
  work: LibraryIndex["works"][number];
}): React.JSX.Element | null {
  const { t } = useTranslation("components");
  const count = countWorkResultProblems(results, work);
  if (count === 0) return null;
  const label = t("linkedResults.workIssueCount", { count });
  return (
    <small className={styles.resultIssueCount} aria-label={label} title={label}>
      <IconAlertTriangle size={13} stroke={2.2} aria-hidden="true" />
      {count}
    </small>
  );
}
