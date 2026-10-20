import React from "react";
import { useTranslation } from "react-i18next";
import type { AppOperationActivityEvent } from "../../../shared/appOperationTypes";
import {
  formatAppOperationProgress,
  isAppOperationActive,
  resolveAppOperationProgress,
} from "../lib/appOperationPresentation";
import { JobCancelButton } from "./RunStatusPanels";
import { ProgressBar } from "./ui/ProgressBar";

export function StatusOperationActivityFeedback({
  activity,
  onCancel,
}: {
  activity: AppOperationActivityEvent;
  onCancel?: () => void;
}): React.JSX.Element | null {
  const { i18n, t } = useTranslation("components");
  if (!isAppOperationActive(activity)) return null;
  const progress = resolveAppOperationProgress(activity);
  const valueText = progress
    ? formatAppOperationProgress(
        activity,
        progress,
        i18n.resolvedLanguage ?? i18n.language,
        (value) => t("statusDock.operation.percent", { value }),
      )
    : t("common.inProgress");
  const waitingText = activity.waitingForUser
    ? t("statusDock.operation.waitingForUser")
    : null;
  return (
    <>
      <div className="operation-progress-card">
        <div className={`progress-meta ${waitingText ? "" : "value-only"}`}>
          {waitingText ? <span>{waitingText}</span> : null}
          <strong>{valueText}</strong>
        </div>
        <ProgressBar
          label={t("statusDock.operation.progressLabel")}
          mode={progress ? "determinate" : "indeterminate"}
          value={progress?.current}
          max={progress?.total}
          valueText={valueText}
        />
      </div>
      <OperationCancelControl activity={activity} onCancel={onCancel} />
    </>
  );
}

function OperationCancelControl({
  activity,
  onCancel,
}: {
  activity: AppOperationActivityEvent;
  onCancel?: () => void;
}): React.JSX.Element | null {
  if (
    !onCancel ||
    (!activity.cancellable && activity.status !== "cancelling")
  ) {
    return null;
  }
  return (
    <JobCancelButton
      cancelling={activity.status === "cancelling"}
      onCancel={onCancel}
    />
  );
}
