import type { TFunction } from "i18next";
import type { TimingAttempt } from "./pageWorkflowTimingModel";

export function formatAttemptDuration(
  attempt: TimingAttempt,
  t: TFunction<"components">,
): string {
  return formatTimingMilliseconds(
    attempt.source === "workflow" ? attempt.elapsedMs : attempt.measuredMs,
    t,
  );
}

/** Shared duration text for recorded timing measurements. */
function formatTimingSeconds(
  totalSeconds: number,
  t: TFunction<"components">,
): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = (totalSeconds - hours * 3600 - minutes * 60).toFixed(2);
  if (hours > 0) {
    return t("pageList.timing.duration.hours", { hours, minutes, seconds });
  }
  if (minutes > 0) {
    return t("pageList.timing.duration.minutes", { minutes, seconds });
  }
  return t("pageList.timing.duration.seconds", { seconds });
}

export function formatTimingMilliseconds(
  milliseconds: number,
  t: TFunction<"components">,
): string {
  return formatTimingSeconds(Math.round(milliseconds / 10) / 100, t);
}

export function formatDateTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
