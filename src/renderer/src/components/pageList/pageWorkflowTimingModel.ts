import type { PageWorkflowTiming } from "../../../../shared/pageWorkflowTiming";
import type { PageWorkflowStage } from "../../../../shared/pageWorkflowStages";
import type { MangaPage } from "../../../../shared/libraryTypes";
import {
  normalizePageProcessingTiming,
  type PageProcessingTimingStage,
} from "../../../../shared/pageProcessingTiming";
import { buildPageTimingReport } from "../../lib/pageTimingReport";

export type TimingStage = PageWorkflowStage | "preparing";
type WorkflowTimingPage = Omit<
  PageWorkflowTiming["pages"][number],
  "stages"
> & {
  stages: Partial<Record<TimingStage, number>>;
};

/** Display-only model. Missing wall time and start/end dates stay unknown. */
export type TimingAttempt = Omit<
  PageWorkflowTiming,
  | "stages"
  | "pages"
  | "startedAt"
  | "elapsedMs"
  | "cleanupMs"
  | "chapters"
  | "runId"
> & {
  recordedAt: string;
  startedAt?: string;
  cleanupMs?: number;
  runId?: string;
  chapters: Array<{ id: string }>;
  stages: Partial<Record<TimingStage, number>>;
  pages: WorkflowTimingPage[];
} & (
    | { source: "workflow"; elapsedMs: number; measuredMs?: never }
    | { source: "translation"; elapsedMs?: never; measuredMs: number }
  );

/** A missing measurement is never shown as zero. */
export type WorkflowStageCell =
  | { kind: "measured"; milliseconds: number }
  | { kind: "skipped" }
  | { kind: "missing" };

export type WorkflowAttemptEntry = {
  attempt: TimingAttempt;
  /**
   * An earlier attempt of the same run is still in the history. History is
   * pruned, so this is not a lifetime attempt count; start times tell
   * attempts apart.
   */
  resumed: boolean;
  chapterPages: WorkflowTimingPage[];
};

/** Newest first. Resumes of one run stay separate attempts. */
export function buildWorkflowAttemptEntries(
  records: readonly PageWorkflowTiming[],
  chapterId: string,
): WorkflowAttemptEntry[] {
  const firstOfRun = new Map<string, PageWorkflowTiming>();
  for (const record of records) {
    const first = firstOfRun.get(record.runId);
    if (!first || compareStartedAt(record, first) < 0) {
      firstOfRun.set(record.runId, record);
    }
  }
  return [...records]
    .sort((left, right) => compareStartedAt(right, left))
    .map((attempt) => ({
      attempt: {
        ...attempt,
        source: "workflow",
        recordedAt: attempt.startedAt,
      },
      resumed: firstOfRun.get(attempt.runId) !== attempt,
      chapterPages: attempt.pages.filter(
        (page) => page.chapterId === chapterId,
      ),
    }));
}

export function attemptStageCell(
  attempt: Pick<TimingAttempt, "stages">,
  stage: TimingStage,
): WorkflowStageCell {
  const milliseconds = attempt.stages[stage];
  return milliseconds === undefined
    ? { kind: "missing" }
    : { kind: "measured", milliseconds };
}

export function pageStageCell(
  page: WorkflowTimingPage | undefined,
  stage: TimingStage,
): WorkflowStageCell {
  const milliseconds = page?.stages[stage];
  if (milliseconds !== undefined) return { kind: "measured", milliseconds };
  return page?.skippedStages.some((skipped) => skipped === stage)
    ? { kind: "skipped" }
    : { kind: "missing" };
}

/** Prefer the page open in the editor, then the chapter's first recorded page. */
export function resolveTimingPageId(
  entry: WorkflowAttemptEntry | undefined,
  ...preferred: Array<string | null | undefined>
): string | null {
  const pages = entry?.chapterPages ?? [];
  for (const pageId of preferred) {
    if (pageId && pages.some((page) => page.pageId === pageId)) return pageId;
  }
  return pages[0]?.pageId ?? null;
}

function compareStartedAt(
  left: PageWorkflowTiming,
  right: PageWorkflowTiming,
): number {
  return (
    Date.parse(left.startedAt) - Date.parse(right.startedAt) ||
    left.attemptId.localeCompare(right.attemptId)
  );
}

const TRANSLATION_STAGE_MAP: Record<PageProcessingTimingStage, TimingStage> = {
  preparing: "preparing",
  ocr: "ocr",
  translation: "translate",
  typography: "typography",
  inpainting: "erase",
};

export const TRANSLATION_TIMING_STAGES = Object.values(TRANSLATION_STAGE_MAP);

/** Existing per-page snapshots share the history UI without rewriting stored data. */
export function buildTimingEntries(
  records: readonly PageWorkflowTiming[],
  pages: readonly MangaPage[],
  chapterId: string | null,
): WorkflowAttemptEntry[] {
  const groups = new Map<string, MangaPage[]>();
  for (const page of pages) {
    const timing = page.processingTiming;
    if (!timing) continue;
    const sessionId = normalizePageProcessingTiming(timing).sessionId;
    const key = sessionId ? `session:${sessionId}` : `page:${page.id}`;
    const group = groups.get(key) ?? [];
    group.push(page);
    groups.set(key, group);
  }
  const legacy = [...groups].map(([key, group]) =>
    translationEntry(key, group, chapterId ?? ""),
  );
  return [
    ...buildWorkflowAttemptEntries(records, chapterId ?? ""),
    ...legacy,
  ].sort(
    (a, b) =>
      Date.parse(b.attempt.recordedAt) - Date.parse(a.attempt.recordedAt),
  );
}

function translationEntry(
  key: string,
  pages: MangaPage[],
  chapterId: string,
): WorkflowAttemptEntry {
  // Keep the established rounding/allocation contract for existing measurements.
  const report = buildPageTimingReport(pages);
  const chapterPages = pages.map((page, index) => ({
    chapterId,
    pageId: page.id,
    pageName: page.name,
    stages: translationStages(page, report.rows[index].secondsByStage),
    skippedStages: [],
  }));
  const stages = Object.fromEntries(
    Object.entries(TRANSLATION_STAGE_MAP)
      .filter(([, stage]) =>
        chapterPages.some((page) => page.stages[stage] !== undefined),
      )
      .map(([stage, mapped]) => [
        mapped,
        report.secondsByStage[stage as PageProcessingTimingStage] * 1000,
      ]),
  );
  const state = report.rows.some((row) => row.state === "running")
    ? "running"
    : report.rows.some((row) => row.state === "interrupted")
      ? "interrupted"
      : "completed";
  const dates = pages
    .map((page) => page.processingTiming?.measuredAt ?? "")
    .sort();
  return {
    resumed: false,
    chapterPages,
    attempt: {
      version: 1,
      attemptId: `translation:${key}`,
      source: "translation",
      recordedAt: dates[dates.length - 1],
      status: state,
      measuredMs: report.totalSeconds * 1000,
      stages,
      chapters: chapterId ? [{ id: chapterId }] : [],
      pages: chapterPages,
    },
  };
}

function translationStages(
  page: MangaPage,
  seconds: Record<PageProcessingTimingStage, number>,
): Partial<Record<TimingStage, number>> {
  const timing = page.processingTiming;
  const normalized = normalizePageProcessingTiming(timing);
  return Object.fromEntries(
    Object.entries(TRANSLATION_STAGE_MAP)
      .filter(
        ([key]) =>
          normalized.stages[key as PageProcessingTimingStage] !== undefined ||
          (timing?.version === 2 &&
            timing.stages[key as PageProcessingTimingStage] === 0),
      )
      .map(([key, mapped]) => [
        mapped,
        seconds[key as PageProcessingTimingStage] * 1000,
      ]),
  );
}

/** Cleanup is only known once an attempt actually reached its end. */
export function cleanupCell(attempt: TimingAttempt): WorkflowStageCell {
  return attempt.cleanupMs === undefined ||
    attempt.status === "running" ||
    attempt.status === "interrupted"
    ? { kind: "missing" }
    : { kind: "measured", milliseconds: attempt.cleanupMs };
}
