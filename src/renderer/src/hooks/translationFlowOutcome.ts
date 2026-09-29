import type { TFunction } from "i18next";
import type { MutableRefObject } from "react";
import type { JobFailureGuidance } from "../../../shared/jobTypes";
import type { NotificationPort } from "../lib/notificationPort";
import { formatJobFailureGuidance } from "../lib/appHelpers";
import {
  setFlowTerminal,
  type RunAnalysisOutcome,
} from "./translationFlowHelpers";
import type { UseTranslationActionsOptions } from "./translationActionTypes";
import type { resolveTranslationCompletionOptions } from "./translationBubbleLayoutWorkflowSupport";

export type TranslationFlowOutcomeContext = Pick<
  UseTranslationActionsOptions,
  "pushStatus" | "setShowBlockChrome" | "setJobState"
> & {
  failureGuidanceRef: MutableRefObject<JobFailureGuidance | undefined>;
  notificationPort: NotificationPort;
  t: TFunction<"renderer">;
};
export type FlowAggregate = {
  anyAttempted: boolean;
  anyFailed: boolean;
  anyPartial: boolean;
  firstError?: string;
};
type TranslationCompletion = ReturnType<
  typeof resolveTranslationCompletionOptions
>;
const FLOW_MESSAGE_KEYS = {
  completed: [
    "translation.flow.completed",
    "translation.eraseOriginalWorkflowCompleted",
    "translation.bubbleLayoutWorkflowCompleted",
  ],
  failed: [
    "translation.errors.jobFailed",
    "translation.eraseOriginalWorkflowFailed",
    "translation.bubbleLayoutWorkflowFailed",
  ],
  partial: [
    "translation.flow.partial",
    "translation.eraseOriginalWorkflowPartial",
    "translation.bubbleLayoutWorkflowPartial",
  ],
} as const;
export function failTranslationFlow(
  error: unknown,
  context: TranslationFlowOutcomeContext,
): "failed" {
  console.error(error);
  const fallback = context.t("translation.errors.jobFailedTitle");
  const message =
    error instanceof Error && error.message.trim() ? error.message : fallback;
  setFlowTerminal(context, "failed", fallback, message);
  context.notificationPort.error(message);
  return "failed";
}
function resolveFlowMessageKey(
  completion: TranslationCompletion,
  status: "completed" | "partial" | "failed",
) {
  const workflowIndex = !completion.eraseOriginal
    ? 0
    : completion.bubbleLayout
      ? 2
      : 1;
  return FLOW_MESSAGE_KEYS[status][workflowIndex];
}
export function finishTranslationFlow(
  aggregate: FlowAggregate,
  completion: { eraseOriginal: boolean; bubbleLayout: boolean },
  context: TranslationFlowOutcomeContext,
  elapsedMs: number,
): RunAnalysisOutcome {
  if (!aggregate.anyAttempted) return "no-op";
  if (aggregate.anyFailed) {
    const fallback = context.t(resolveFlowMessageKey(completion, "failed"));
    const failureGuidance = context.failureGuidanceRef.current;
    const guidanceMessage = formatJobFailureGuidance(
      { failureGuidance },
      context.t,
    );
    const message =
      guidanceMessage ?? (aggregate.firstError?.trim() || fallback);
    setFlowTerminal(
      context,
      "failed",
      guidanceMessage ?? fallback,
      message,
      undefined,
      failureGuidance,
    );
    context.notificationPort.error(message);
    return "failed";
  }
  if (aggregate.anyPartial) {
    const message = context.t(resolveFlowMessageKey(completion, "partial"));
    setFlowTerminal(context, "partial", message, message);
    context.notificationPort.warn(message);
    return "partial";
  }

  const message = context.t(resolveFlowMessageKey(completion, "completed"));
  setFlowTerminal(context, "completed", message, undefined, elapsedMs);
  if (completion.eraseOriginal) {
    context.setShowBlockChrome(false);
  }
  context.notificationPort.success(message);
  return "completed";
}
