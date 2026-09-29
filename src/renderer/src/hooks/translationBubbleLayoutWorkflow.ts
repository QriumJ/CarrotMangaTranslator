import type { MutableRefObject } from "react";
import type { PageTimingSessionRef } from "../../../shared/pageProcessingTiming";
import type { RunAnalysisOutcome } from "./translationFlowHelpers";
import type {
  TranslationFlowOptions,
  UseTranslationActionsOptions,
} from "./translationActionTypes";
import {
  createRendererPageTimingSession,
  finishRendererPageTimingSession,
} from "../lib/pageTimingSession";
import {
  refreshTranslationLibrary,
  resolveNaturalTextLayout,
  resolveTranslationCompletionOptions,
} from "./translationBubbleLayoutWorkflowSupport";
import {
  runTranslationChapter,
  type ChapterFlowResult,
  type TranslationChapterContext,
  type TranslationChapterExecution,
} from "./translationChapterFlow";
import {
  failTranslationFlow,
  finishTranslationFlow,
  type FlowAggregate,
  type TranslationFlowOutcomeContext,
} from "./translationFlowOutcome";

type TranslationFlowActionContext = TranslationChapterContext &
  TranslationFlowOutcomeContext &
  Pick<
    UseTranslationActionsOptions,
    | "currentChapter"
    | "flowCancellationRef"
    | "jobActive"
    | "naturalTextLayoutDefault"
    | "refreshLibrary"
    | "rendererFlowActiveRef"
    | "saveNow"
    | "setFlowActive"
  > & { flowActiveRef: MutableRefObject<boolean> };
type FlowExecution = TranslationChapterExecution & {
  context: TranslationFlowActionContext;
};
type PendingFinalTiming = {
  chapterId: string;
  result: ChapterFlowResult;
  session: PageTimingSessionRef;
};
export async function runTranslationFlowAction(
  options: TranslationFlowOptions,
  context: TranslationFlowActionContext,
): Promise<RunAnalysisOutcome> {
  const currentChapter = context.currentChapter;
  if (
    !currentChapter ||
    context.jobActive ||
    context.flowActiveRef.current ||
    // This flow owns the shared cancellation flag; it never overlaps another.
    context.rendererFlowActiveRef?.current ||
    options.selection.length === 0
  ) {
    return "no-op";
  }
  const completion = resolveTranslationCompletionOptions(options);
  const naturalTextLayout = resolveNaturalTextLayout(
    options.naturalTextLayout,
    context.naturalTextLayoutDefault,
  );
  context.flowActiveRef.current = true;
  context.failureGuidanceRef.current = undefined;
  if (context.flowCancellationRef) {
    context.flowCancellationRef.current = false;
  }
  context.setFlowActive(true);
  try {
    return await executeTranslationFlow({
      options,
      context,
      currentChapter,
      completion,
      naturalTextLayout,
    });
  } catch (error) {
    return failTranslationFlow(error, context);
  } finally {
    context.flowActiveRef.current = false;
    context.setFlowActive(false);
  }
}

async function executeTranslationFlow(
  execution: FlowExecution,
): Promise<RunAnalysisOutcome> {
  const startedAt = performance.now();
  const { completion, context, options } = execution;
  const aggregate: FlowAggregate = {
    anyAttempted: false,
    anyFailed: false,
    anyPartial: false,
  };
  const firstTimingSession = createRendererPageTimingSession();
  await context.saveNow();
  if (isFlowCancellationRequested(context)) {
    await finishRendererPageTimingSession(
      options.selection[0]?.chapterId ?? execution.currentChapter.id,
      firstTimingSession,
      "interrupted",
    );
    return finishCancelledFlow(context, completion.eraseOriginal);
  }
  const queue = await runTranslationChapterQueue(
    execution,
    aggregate,
    firstTimingSession,
  );
  if (queue === "cancelled") return queue;
  const { pendingFinalTiming } = queue;
  if (completion.eraseOriginal) await refreshTranslationLibrary(context);
  if (isFlowCancellationRequested(context)) {
    if (pendingFinalTiming) {
      await finishRendererPageTimingSession(
        pendingFinalTiming.chapterId,
        pendingFinalTiming.session,
        "interrupted",
      );
    }
    return finishCancelledFlow(context, completion.eraseOriginal);
  }
  if (pendingFinalTiming) {
    await finishRendererPageTimingSession(
      pendingFinalTiming.chapterId,
      pendingFinalTiming.session,
      resolveChapterTimingState(pendingFinalTiming.result),
    );
  }
  return finishTranslationFlow(
    aggregate,
    completion,
    context,
    Math.max(0, performance.now() - startedAt),
  );
}

async function runTranslationChapterQueue(
  execution: FlowExecution,
  aggregate: FlowAggregate,
  firstTimingSession: PageTimingSessionRef,
): Promise<"cancelled" | { pendingFinalTiming?: PendingFinalTiming }> {
  const { completion, context, options } = execution;
  let pendingFinalTiming: PendingFinalTiming | undefined;
  for (let index = 0; index < options.selection.length; index += 1) {
    const chapterId =
      options.selection[index]?.chapterId ?? execution.currentChapter.id;
    if (isFlowCancellationRequested(context)) {
      if (index === 0) {
        await finishRendererPageTimingSession(
          chapterId,
          firstTimingSession,
          "interrupted",
        );
      }
      return finishCancelledFlow(context, completion.eraseOriginal);
    }
    const timingSession =
      index === 0 ? firstTimingSession : createRendererPageTimingSession();
    const result = await runTimedTranslationChapter(
      execution,
      index,
      timingSession,
    );
    if (result.status === "cancelled") {
      if (result.refreshLibrary) await refreshTranslationLibrary(context);
      await finishRendererPageTimingSession(
        chapterId,
        timingSession,
        "interrupted",
      );
      return finishCancelledFlow(context, result.inpainting);
    }
    mergeChapterFlowResult(aggregate, result);
    const isLastProcessedChapter =
      result.stopQueue || index === options.selection.length - 1;
    if (isLastProcessedChapter) {
      pendingFinalTiming = { chapterId, result, session: timingSession };
    } else {
      await finishRendererPageTimingSession(
        chapterId,
        timingSession,
        resolveChapterTimingState(result),
      );
    }
    if (result.stopQueue) break;
  }
  return { pendingFinalTiming };
}

async function runTimedTranslationChapter(
  execution: FlowExecution,
  index: number,
  timingSession: PageTimingSessionRef,
): Promise<ChapterFlowResult> {
  try {
    return await runTranslationChapter(execution, index, timingSession, () =>
      isFlowCancellationRequested(execution.context),
    );
  } catch (error) {
    await finishRendererPageTimingSession(
      execution.options.selection[index]?.chapterId ??
        execution.currentChapter.id,
      timingSession,
      "interrupted",
    );
    throw error;
  }
}
function mergeChapterFlowResult(
  aggregate: FlowAggregate,
  result: Extract<ChapterFlowResult, { status: "continue" }>,
): void {
  if (result.attempted) aggregate.anyAttempted = true;
  if (result.failed) aggregate.anyFailed = true;
  if (result.partial) aggregate.anyPartial = true;
  if (!aggregate.firstError && result.error)
    aggregate.firstError = result.error;
}
function resolveChapterTimingState(
  result: ChapterFlowResult,
): "completed" | "interrupted" {
  return result.status === "continue" && !result.failed && !result.partial
    ? "completed"
    : "interrupted";
}
function isFlowCancellationRequested(
  context: Pick<TranslationFlowActionContext, "flowCancellationRef">,
): boolean {
  return context.flowCancellationRef?.current === true;
}
function finishCancelledFlow(
  context: TranslationFlowActionContext,
  inpainting: boolean,
): "cancelled" {
  context.setJobState({
    id: "translation-flow-cancelled",
    kind: inpainting ? "inpainting" : "gemma-analysis",
    status: "cancelled",
    progressText: context.t("job.phase.cancelled"),
    phase: "cancelled",
  });
  return "cancelled";
}
