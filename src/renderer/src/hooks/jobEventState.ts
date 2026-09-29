import type { TFunction } from "i18next";
import type { JobEvent, JobState } from "../../../shared/jobTypes";
import { appendCodexPreview } from "../../../shared/codexTypesettingProgress";
import { isTerminalJobStatus } from "../../../shared/jobContracts";
import { resolveInstallLogLines } from "../lib/appHelpers";
import { formatJobLabel } from "../lib/jobProgress";
import { isAggregateFlowTerminal } from "./jobEventFlowGuard";
import { isLogOnlyEvent } from "./jobEventUtils";
type NextJobStateOptions = {
  current: JobState;
  event: JobEvent;
  preserveCurrentStatus: boolean;
  sameJob: boolean;
  t: TFunction<"renderer">;
};

type NextProgressState = Pick<
  JobState,
  | "progressMode"
  | "progressPercent"
  | "progressBytes"
  | "progressTotalBytes"
  | "progressBytesPerSecond"
>;

export function reduceJobEventBatch(
  current: JobState,
  events: readonly JobEvent[],
  t: TFunction<"renderer">,
): JobState {
  return events.reduce(
    (next, event) => reduceJobState(next, event, t),
    current,
  );
}

function reduceJobState(
  current: JobState,
  event: JobEvent,
  t: TFunction<"renderer">,
): JobState {
  if (
    isAggregateFlowTerminal(current) &&
    event.id !== current.id &&
    isTerminalJobStatus(event.status)
  ) {
    return current;
  }
  const sameJob = current.id === event.id;
  if (!sameJob && ["running", "cancelling"].includes(current.status))
    return current;
  if (sameJob && isTerminalJobStatus(current.status)) {
    return current;
  }
  const preserveCurrentStatus = sameJob && isLogOnlyEvent(event);
  return buildNextJobState({
    current,
    event,
    preserveCurrentStatus,
    sameJob,
    t,
  });
}

function buildNextJobState({
  current,
  event,
  preserveCurrentStatus,
  sameJob,
  t,
}: NextJobStateOptions): JobState {
  return {
    id: event.id,
    kind: preserveCurrentStatus ? current.kind : event.kind,
    status: preserveCurrentStatus ? current.status : event.status,
    progressText: preserveCurrentStatus
      ? current.progressText
      : formatJobLabel(event, t),
    detail: keepOrFallback(preserveCurrentStatus, current.detail, event.detail),
    phase: keepOrFallback(preserveCurrentStatus, current.phase, event.phase),
    ocrPipeline: keepOrFallback(
      preserveCurrentStatus,
      current.ocrPipeline,
      event.ocrPipeline,
    ),
    ...resolveNextProgressState(current, event, preserveCurrentStatus),
    installLogLine: event.installLogLine,
    installLogLines: resolveInstallLogLines(current, event, sameJob),
    progressCurrent: keepOrFallback(
      preserveCurrentStatus,
      current.progressCurrent,
      event.progressCurrent,
    ),
    progressTotal: keepOrFallback(
      preserveCurrentStatus,
      current.progressTotal,
      event.progressTotal,
    ),
    pageIndex: keepOrFallback(
      preserveCurrentStatus,
      current.pageIndex,
      event.pageIndex,
    ),
    pageTotal: keepOrFallback(
      preserveCurrentStatus,
      current.pageTotal,
      event.pageTotal,
    ),
    attempt: keepOrFallback(
      preserveCurrentStatus,
      current.attempt,
      event.attempt,
    ),
    attemptTotal: keepOrFallback(
      preserveCurrentStatus,
      current.attemptTotal,
      event.attemptTotal,
    ),
    failureGuidance:
      event.failureGuidance ?? (sameJob ? current.failureGuidance : undefined),
    codexProgress: preserveCurrentStatus
      ? current.codexProgress
      : event.codexProgress,
    codexPreviewHistory: nextCodexPreviewHistory(current, event),
    research: event.research ?? (sameJob ? current.research : undefined),
    targets: event.targets ?? (sameJob ? current.targets : undefined),
  };
}

function resolveNextProgressState(
  current: JobState,
  event: JobEvent,
  preserveCurrentStatus: boolean,
): NextProgressState {
  return {
    progressMode: keepOrEvent(
      preserveCurrentStatus,
      current.progressMode,
      event.progressMode,
    ),
    progressPercent: keepOrEvent(
      preserveCurrentStatus,
      current.progressPercent,
      event.progressPercent,
    ),
    progressBytes: keepOrEvent(
      preserveCurrentStatus,
      current.progressBytes,
      event.progressBytes,
    ),
    progressTotalBytes: keepOrEvent(
      preserveCurrentStatus,
      current.progressTotalBytes,
      event.progressTotalBytes,
    ),
    progressBytesPerSecond: keepOrEvent(
      preserveCurrentStatus,
      current.progressBytesPerSecond,
      event.progressBytesPerSecond,
    ),
  };
}

function keepOrEvent<T>(preserve: boolean, current: T, eventValue: T): T {
  return preserve ? current : eventValue;
}

function keepOrFallback<T>(
  preserve: boolean,
  current: T | undefined,
  eventValue: T | undefined,
): T | undefined {
  return preserve ? current : (eventValue ?? current);
}

function nextCodexPreviewHistory(current: JobState, event: JobEvent) {
  return appendCodexPreview(
    current.id === event.id ? current.codexPreviewHistory : undefined,
    event.codexProgress?.preview,
  );
}
