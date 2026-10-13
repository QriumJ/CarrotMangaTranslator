import React from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { MangaPage } from "../../../../shared/libraryTypes";
import { PAGE_WORKFLOW_STAGES } from "../../../../shared/pageWorkflowStages";
import { Button } from "../ui/Button";
import { InlineMessage } from "../ui/InlineMessage";
import { SelectionSurface } from "../ui/SelectionCard";
import { Select } from "../ui/Select";
import {
  formatAttemptDuration,
  formatDateTime,
  formatTimingMilliseconds,
} from "./pageTimingFormat";
import {
  attemptStageCell,
  cleanupCell,
  buildTimingEntries,
  TRANSLATION_TIMING_STAGES,
  type TimingAttempt,
  pageStageCell,
  resolveTimingPageId,
  type WorkflowAttemptEntry,
  type WorkflowStageCell,
} from "./pageWorkflowTimingModel";
import { usePageWorkflowTimings } from "./usePageWorkflowTimings";
import styles from "./PageWorkflowTimingView.module.css";

export function PageWorkflowTimingView({
  chapterId,
  selectedPageId,
  pages = EMPTY_PAGES,
}: {
  chapterId: string | null;
  pages?: MangaPage[];
  selectedPageId: string | null;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const timings = usePageWorkflowTimings(chapterId ?? "", Boolean(chapterId));
  const entries = React.useMemo(
    () => buildTimingEntries(timings.records, pages, chapterId),
    [chapterId, pages, timings.records],
  );
  const [attemptId, setAttemptId] = React.useState<string | null>(null);
  const entry =
    entries.find((candidate) => candidate.attempt.attemptId === attemptId) ??
    entries[0];

  if (!entry) {
    return (
      <TimingEmptyState
        status={chapterId ? timings.status : "ready"}
        onRetry={timings.reload}
      />
    );
  }
  return (
    <div className={styles.layout}>
      <AttemptList
        entries={entries}
        selectedId={entry.attempt.attemptId}
        onSelect={setAttemptId}
      />
      <div className={styles.detail}>
        {timings.refreshFailed || timings.status === "error" ? (
          <InlineMessage
            variant="warning"
            title={t("pageList.timing.workflow.refreshFailed")}
          />
        ) : null}
        <AttemptDetail
          key={entry.attempt.attemptId}
          entry={entry}
          selectedPageId={selectedPageId}
          onRefresh={timings.reload}
        />
      </div>
    </div>
  );
}

const EMPTY_PAGES: MangaPage[] = [];

function TimingEmptyState({
  status,
  onRetry,
}: {
  status: "loading" | "ready" | "error";
  onRetry: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div
      className={styles.state}
      role={status === "loading" ? "status" : undefined}
    >
      {status === "error" ? (
        <>
          <InlineMessage
            variant="danger"
            title={t("pageList.timing.workflow.loadFailed")}
          />
          <Button size="sm" onClick={onRetry}>
            {t("pageList.timing.workflow.retry")}
          </Button>
        </>
      ) : (
        <strong>
          {t(
            status === "loading"
              ? "pageList.timing.workflow.loading"
              : "pageList.timing.workflow.emptyTitle",
          )}
        </strong>
      )}
    </div>
  );
}

function AttemptList({
  entries,
  selectedId,
  onSelect,
}: {
  entries: WorkflowAttemptEntry[];
  selectedId: string;
  onSelect: (attemptId: string) => void;
}): React.JSX.Element {
  const { t, i18n } = useTranslation("components");
  return (
    <nav
      className={styles.attempts}
      aria-label={t("pageList.timing.workflow.attemptsLabel")}
    >
      {entries.map(({ attempt, resumed }) => (
        <SelectionSurface
          key={attempt.attemptId}
          as="button"
          variant="row"
          className={styles.attempt}
          selected={attempt.attemptId === selectedId}
          aria-current={attempt.attemptId === selectedId ? "true" : undefined}
          onClick={() => onSelect(attempt.attemptId)}
        >
          <span className={styles.attemptDate}>
            {formatDateTime(attempt.recordedAt, i18n.language)}
          </span>
          <span className={styles.attemptMeta}>
            <StatusBadge status={attempt.status} source={attempt.source} />
            <span className={styles.number}>
              {formatAttemptDuration(attempt, t)}
            </span>
          </span>
          {resumed ? (
            <span className={styles.attemptNote}>
              {t("pageList.timing.workflow.resumed")}
            </span>
          ) : null}
        </SelectionSurface>
      ))}
    </nav>
  );
}

function AttemptDetail({
  entry,
  selectedPageId,
  onRefresh,
}: {
  entry: WorkflowAttemptEntry;
  selectedPageId: string | null;
  onRefresh: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const { attempt, chapterPages } = entry;
  const [chosenPageId, setChosenPageId] = React.useState<string | null>(null);
  const pageId = resolveTimingPageId(entry, chosenPageId, selectedPageId);
  const page = chapterPages.find((candidate) => candidate.pageId === pageId);
  return (
    <>
      <AttemptHeader attempt={attempt} onRefresh={onRefresh} />
      {chapterPages.length > 0 ? (
        <div className={styles.pageRow}>
          <span aria-hidden="true">
            {t("pageList.timing.workflow.pageSelect")}
          </span>
          <Select
            className={styles.pageSelect}
            ariaLabel={t("pageList.timing.workflow.pageSelect")}
            value={pageId ?? ""}
            searchable="auto"
            options={chapterPages.map((candidate) => ({
              value: candidate.pageId,
              label: candidate.pageName,
            }))}
            onValueChange={setChosenPageId}
          />
        </div>
      ) : (
        <p className={styles.muted}>
          {t("pageList.timing.workflow.noChapterPages")}
        </p>
      )}
      <StageTable attempt={attempt} page={page} />
    </>
  );
}

function AttemptHeader({
  attempt,
  onRefresh,
}: {
  attempt: TimingAttempt;
  onRefresh: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const running = attempt.status === "running";
  return (
    <header className={styles.header}>
      <dl className={styles.facts}>
        <div>
          <dt>
            {t(
              attempt.source === "translation"
                ? "pageList.timing.workflow.measuredTotal"
                : running
                  ? "pageList.timing.workflow.elapsedSoFar"
                  : "pageList.timing.workflow.runTotal",
            )}
          </dt>
          <dd className={styles.total}>{formatAttemptDuration(attempt, t)}</dd>
        </div>
        <div>
          <dt>{t("pageList.timing.workflow.status")}</dt>
          <dd>
            <StatusBadge status={attempt.status} source={attempt.source} />
          </dd>
        </div>
        <AttemptDates attempt={attempt} />
        <div>
          <dt
            title={
              attempt.chapters.length > 1
                ? t("pageList.timing.workflow.multiChapterNote")
                : undefined
            }
          >
            {t("pageList.timing.workflow.coverage")}
          </dt>
          <dd>
            {attempt.source === "translation"
              ? t("pageList.timing.recordedPages", {
                  count: attempt.pages.length,
                })
              : t("pageList.timing.workflow.coverageValue", {
                  chapters: attempt.chapters.length,
                  pages: attempt.pages.length,
                })}
          </dd>
        </div>
      </dl>
      {running ? (
        <Button size="sm" variant="ghost" onClick={onRefresh}>
          {t("pageList.timing.workflow.refresh")}
        </Button>
      ) : null}
    </header>
  );
}

function AttemptDates({
  attempt,
}: {
  attempt: TimingAttempt;
}): React.JSX.Element {
  const { t, i18n } = useTranslation("components");
  return (
    <>
      <div>
        <dt>
          {t(
            attempt.source === "translation"
              ? "pageList.timing.workflow.recorded"
              : "pageList.timing.workflow.started",
          )}
        </dt>
        <dd>{formatDateTime(attempt.recordedAt, i18n.language)}</dd>
      </div>
      {attempt.source === "workflow" ? (
        <div>
          <dt>{t("pageList.timing.workflow.finished")}</dt>
          <dd>
            {attempt.finishedAt
              ? formatDateTime(attempt.finishedAt, i18n.language)
              : t("pageList.timing.workflow.notFinished")}
          </dd>
        </div>
      ) : null}
    </>
  );
}

function StageTable({
  attempt,
  page,
}: {
  attempt: TimingAttempt;
  page: TimingAttempt["pages"][number] | undefined;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t("pageList.timing.workflow.stage")}</th>
            <th scope="col">
              {t(
                attempt.source === "translation"
                  ? "pageList.timing.workflow.pageTotal"
                  : "pageList.timing.workflow.wholeRun",
              )}
            </th>
            <th scope="col" title={page?.pageName}>
              {t("pageList.timing.workflow.selectedPage")}
            </th>
          </tr>
        </thead>
        <tbody>
          {(attempt.source === "translation"
            ? TRANSLATION_TIMING_STAGES
            : PAGE_WORKFLOW_STAGES
          ).map((stage) => (
            <tr key={stage}>
              <th scope="row">
                {t(`pageList.timing.workflow.stages.${stage}`)}
              </th>
              <StageCell cell={attemptStageCell(attempt, stage)} t={t} />
              <StageCell cell={pageStageCell(page, stage)} t={t} />
            </tr>
          ))}
        </tbody>
        {attempt.source === "workflow" ? (
          <tfoot>
            <tr>
              <th scope="row">{t("pageList.timing.workflow.cleanup")}</th>
              <StageCell cell={cleanupCell(attempt)} t={t} />
              <td aria-hidden="true" />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function StageCell({
  cell,
  t,
}: {
  cell: WorkflowStageCell;
  t: TFunction<"components">;
}): React.JSX.Element {
  if (cell.kind === "measured") {
    return (
      <td className={styles.number}>
        {formatTimingMilliseconds(cell.milliseconds, t)}
      </td>
    );
  }
  if (cell.kind === "skipped") {
    return (
      <td>
        <span className={styles.skipped}>
          {t("pageList.timing.workflow.skipped")}
        </span>
      </td>
    );
  }
  return (
    <td className={styles.missing}>
      <span aria-hidden="true">—</span>
      <span className="visually-hidden">
        {t("pageList.timing.workflow.notMeasured")}
      </span>
    </td>
  );
}

function StatusBadge({
  status,
  source,
}: Pick<TimingAttempt, "source" | "status">): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <span
      className={styles.status}
      data-status={status}
      title={
        source === "workflow" && status === "interrupted"
          ? t("pageList.timing.workflow.interruptedNote")
          : source === "workflow" && status === "running"
            ? t("pageList.timing.workflow.runningNote")
            : undefined
      }
    >
      {t(`pageList.timing.workflow.statuses.${status}`)}
    </span>
  );
}
