import React from "react";
import { useTranslation } from "react-i18next";
import type { AppOperationActivityEvent } from "../../../../shared/appOperationTypes";
import {
  ACCOUNT_CLI_NAMES,
  type AccountCliRuntime,
} from "../../lib/accountRuntimePresentation";
import { formatAppOperationActivity } from "../../lib/appOperationPresentation";
import { StatusOperationActivityFeedback } from "../StatusOperationActivityFeedback";
import { InlineMessage } from "../ui/InlineMessage";
import styles from "./AccountRuntimeSetup.module.css";

/**
 * First-use state of an account that signs in through an AI CLI: why the
 * official runtime is downloaded once, its live download/sign-in progress
 * (the same operation as the status dock) and a failure that can be retried.
 */
export function AccountRuntimeSetup({
  runtime,
  runtimeMissing,
  activity,
  signInError,
  onCancel,
}: {
  runtime: AccountCliRuntime;
  runtimeMissing: boolean;
  activity: AppOperationActivityEvent | null;
  /** A rejected sign-in (download or authentication), retried by the same button. */
  signInError: string | null;
  onCancel: () => void;
}): React.JSX.Element | null {
  const { t } = useTranslation("components");
  const { t: rendererT } = useTranslation("renderer");
  const name = ACCOUNT_CLI_NAMES[runtime];
  if (activity)
    return (
      <div className={styles.setup}>
        <p className={styles.phase} role="status">
          {formatAppOperationActivity(activity, rendererT)}
        </p>
        <StatusOperationActivityFeedback
          activity={activity}
          onCancel={onCancel}
        />
      </div>
    );
  if (!runtimeMissing && !signInError) return null;
  return (
    <div className={styles.setup}>
      {signInError ? (
        <InlineMessage
          variant="danger"
          title={t(
            runtimeMissing
              ? "settings.accountRuntime.downloadFailed"
              : "settings.accountRuntime.connectFailed",
            { name },
          )}
          detail={`${signInError}\n${t("settings.accountRuntime.retryHint")}`}
        />
      ) : (
        <InlineMessage
          title={t("settings.accountRuntime.missingTitle", { name })}
          detail={t("settings.accountRuntime.missingDetail", { name })}
        />
      )}
    </div>
  );
}
