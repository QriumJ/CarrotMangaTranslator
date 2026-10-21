import type { TFunction } from "i18next";
import type { JobState } from "../../../shared/jobTypes";

export type WorkflowProgressText = {
  /** What the run covers, e.g. "80페이지 · 7단계". */
  scope: string;
  /** Counted stage operations, e.g. "단계 작업 123 / 560"; null before counts. */
  operations: string | null;
};

/**
 * A page workflow counts stage operations (pages × stages), not pages, so its
 * counts are labelled as such. Plain jobs return null and keep their wording.
 */
export function formatWorkflowProgress(
  job: Pick<JobState, "workflowProgress">,
  counts: { current: number; total: number } | null,
  t: TFunction<"renderer">,
): WorkflowProgressText | null {
  const progress = job.workflowProgress;
  if (
    !progress ||
    !isPositiveCount(progress.pageCount) ||
    !isPositiveCount(progress.stageCount)
  ) {
    return null;
  }
  return {
    scope: t("job.workflowProgress.scope", {
      pages: progress.pageCount,
      stages: progress.stageCount,
    }),
    operations: counts
      ? t("job.workflowProgress.operations", {
          current: counts.current,
          total: counts.total,
        })
      : null,
  };
}

function isPositiveCount(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
