import type { TFunction } from "i18next";
import type {
  AutoInpaintingChapterSelection,
  InpaintingPostprocessOptions,
} from "../../../shared/inpaintingTypes";
import type { ChapterSnapshot } from "../../../shared/libraryTypes";
import type { PageTimingSessionRef } from "../../../shared/pageProcessingTiming";
import type { ChapterRunSelection } from "../lib/translationSelection";
import type { RunAnalysisOutcome } from "./translationFlowHelpers";
import type {
  TranslationFlowOptions,
  UseTranslationActionsOptions,
} from "./translationActionTypes";
import { runInpaintingSelectionsSequentially } from "./inpaintingSelectionFlow";
import {
  resolvePersistedInpaintingSelection,
  resolveTranslationChapterSelections,
} from "./translationChapterSelections";
import {
  applyTranslationInpaintingResult,
  type resolveTranslationCompletionOptions,
} from "./translationBubbleLayoutWorkflowSupport";

export type TranslationChapterContext = Pick<
  UseTranslationActionsOptions,
  | "clearPageImageCache"
  | "clearRetouchHistory"
  | "mergeLiveChapter"
  | "pushStatus"
  | "recordImageEdit"
> & {
  runPasses: (
    selection: ChapterRunSelection,
    timingSession: PageTimingSessionRef,
  ) => Promise<RunAnalysisOutcome>;
  t: TFunction<"renderer">;
};
type TranslationCompletion = ReturnType<
  typeof resolveTranslationCompletionOptions
>;
export type TranslationChapterExecution = {
  options: TranslationFlowOptions;
  context: TranslationChapterContext;
  currentChapter: ChapterSnapshot;
  completion: TranslationCompletion;
  naturalTextLayout: boolean;
};
export type ChapterFlowResult =
  | {
      status: "continue";
      attempted: boolean;
      failed: boolean;
      stopQueue: boolean;
      partial: boolean;
      error?: string;
    }
  | {
      status: "cancelled";
      inpainting: boolean;
      refreshLibrary: boolean;
    };
export async function runTranslationChapter(
  execution: TranslationChapterExecution,
  index: number,
  timingSession: PageTimingSessionRef,
  shouldCancel: () => boolean,
): Promise<ChapterFlowResult> {
  const { completion, context, options } = execution;
  const selection = options.selection[index];
  reportChapterProgress(index, options.selection.length, context);
  const selections = await resolveTranslationChapterSelections(
    selection,
    completion,
  );
  if (shouldCancel()) {
    return {
      status: "cancelled",
      inpainting: completion.eraseOriginal,
      refreshLibrary: false,
    };
  }
  const translationOutcome = selections.analysis
    ? await context.runPasses(selections.analysis, timingSession)
    : "completed";
  if (shouldCancel()) {
    return {
      status: "cancelled",
      inpainting: completion.eraseOriginal,
      refreshLibrary: false,
    };
  }
  const translationResult = resolveTranslationChapterResult(
    translationOutcome,
    completion,
  );
  if (translationResult && translationOutcome !== "page-failed")
    return translationResult;
  const inpaintingSelection =
    translationOutcome === "page-failed" && selections.inpainting
      ? await resolvePersistedInpaintingSelection(
          selections.inpainting,
          completion,
        )
      : selections.inpainting;
  if (!inpaintingSelection) {
    return (
      translationResult ??
      continuationResult(translationOutcome === "completed", false)
    );
  }
  const inpaintingResult = await runTranslationInpaintingChapter(
    inpaintingSelection,
    execution,
    timingSession,
    shouldCancel,
  );
  if (inpaintingResult.status === "cancelled" || shouldCancel()) {
    return { status: "cancelled", inpainting: true, refreshLibrary: true };
  }
  return resolveInpaintingChapterResult(inpaintingResult, translationOutcome);
}
function resolveTranslationChapterResult(
  outcome: RunAnalysisOutcome,
  completion: TranslationCompletion,
): ChapterFlowResult | null {
  if (outcome === "cancelled") {
    return {
      status: "cancelled",
      inpainting: completion.eraseOriginal,
      refreshLibrary: false,
    };
  }
  if (outcome === "failed") return continuationResult(true, true);
  if (outcome === "page-failed") {
    return {
      status: "continue",
      attempted: true,
      failed: true,
      stopQueue: false,
      partial: false,
    };
  }
  if (outcome === "partial") {
    return continuationResult(true, false, undefined, true);
  }
  return null;
}
function continuationResult(
  attempted: boolean,
  failed: boolean,
  error?: string,
  partial = false,
): Extract<ChapterFlowResult, { status: "continue" }> {
  return {
    status: "continue",
    attempted,
    failed,
    stopQueue: failed,
    partial,
    error,
  };
}
function resolveInpaintingChapterResult(
  inpaintingResult: Awaited<ReturnType<typeof runTranslationInpaintingChapter>>,
  translationOutcome: RunAnalysisOutcome,
): Extract<ChapterFlowResult, { status: "continue" }> {
  const result = continuationResult(
    true,
    inpaintingResult.status === "failed",
    inpaintingResult.error,
    inpaintingResult.status === "partial",
  );
  if (translationOutcome === "page-failed") result.failed = true;
  return result;
}
async function runTranslationInpaintingChapter(
  selection: AutoInpaintingChapterSelection,
  execution: TranslationChapterExecution,
  timingSession: PageTimingSessionRef,
  shouldCancel: () => boolean,
) {
  const { completion, currentChapter, naturalTextLayout } = execution;
  const postprocess: InpaintingPostprocessOptions = {
    bubbleLayout: {
      enabled: completion.bubbleLayout,
      policy: "balanced",
      ...(completion.bubbleLayout && naturalTextLayout
        ? { naturalTextLayout: true }
        : {}),
    },
  };
  return runInpaintingSelectionsSequentially({
    workId: currentChapter.workId,
    selections: [selection],
    engine: execution.options.inpaintingEngine,
    postprocess,
    timingSession,
    shouldCancel,
    onResult: (result) =>
      applyTranslationInpaintingResult(
        result,
        selection,
        currentChapter,
        execution.context,
      ),
  });
}
function reportChapterProgress(
  index: number,
  total: number,
  context: TranslationChapterContext,
): void {
  if (total <= 1) return;
  context.pushStatus(
    context.t("translation.flow.chapterProgress", {
      pass: context.t("translation.flow.translation"),
      current: index + 1,
      total,
    }),
  );
}
