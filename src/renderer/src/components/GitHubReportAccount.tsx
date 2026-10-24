import React from "react";
import { useTranslation } from "react-i18next";
import type { useGitHubReportAccount } from "./useGitHubReportAccount";
import { Button } from "./ui/Button";
import { InlineMessage } from "./ui/InlineMessage";
import { CheckCircleIcon, CopyIcon } from "./ui/icons";
import styles from "./ErrorReportDialog.module.css";

type AccountModel = ReturnType<typeof useGitHubReportAccount>;

/**
 * The report's sign-in step. The footer's primary action starts sign-in and
 * submits; this block explains the current step and owns the device-code
 * controls so the code is never buried in a sentence.
 */
export function GitHubReportAccount({
  model,
  disabled,
}: {
  model: AccountModel;
  disabled: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className={styles.account}>
      <GitHubReportAccountStep model={model} disabled={disabled} />
      {model.failed ? (
        <p className={styles.actionError} role="alert">
          {t("errorReport.accountError")}
        </p>
      ) : null}
    </div>
  );
}

function GitHubReportAccountStep({
  model,
  disabled,
}: {
  model: AccountModel;
  disabled: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const { account, busy, phase, act } = model;
  if (phase === "checking")
    return (
      <p className={styles.accountNote} role="status">
        {t("errorReport.accountChecking")}
      </p>
    );
  if (phase === "unconfigured")
    return (
      <InlineMessage
        variant="warning"
        role="alert"
        title={t("errorReport.accountUnconfigured")}
      />
    );
  if (phase === "pending" && account?.userCode)
    return (
      <GitHubDeviceCode
        key={account.userCode}
        code={account.userCode}
        busy={busy || disabled}
        onCancel={() => void act("disconnect")}
      />
    );
  if (phase === "connected")
    return (
      <div className={styles.accountConnected}>
        <CheckCircleIcon className={styles.accountConnectedIcon} size={16} />
        <p role="status">
          {t("errorReport.accountConnected", { login: account?.login })}
        </p>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || busy}
          onClick={() => void act("disconnect")}
        >
          {t("errorReport.accountDisconnect")}
        </Button>
      </div>
    );
  return (
    <div className={styles.accountSignedOut}>
      <strong>{t("errorReport.accountRequired")}</strong>
    </div>
  );
}

function GitHubDeviceCode({
  code,
  busy,
  onCancel,
}: {
  code: string;
  busy: boolean;
  onCancel: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const headingId = React.useId();
  const [copy, setCopy] = React.useState<"idle" | "copied" | "failed">("idle");
  const copyCode = () => {
    void navigator.clipboard
      .writeText(code)
      .then(() => setCopy("copied"))
      .catch(() => setCopy("failed"));
  };
  return (
    <section className={styles.device} aria-labelledby={headingId}>
      <div className={styles.deviceCopy}>
        <h3 id={headingId}>{t("errorReport.deviceTitle")}</h3>
      </div>
      <div className={styles.deviceCodeRow}>
        <code
          className={styles.deviceCode}
          aria-label={t("errorReport.deviceCodeLabel")}
        >
          {code}
        </code>
        <Button iconLeft={<CopyIcon size={16} />} onClick={copyCode}>
          {t(
            copy === "copied"
              ? "errorReport.deviceCopied"
              : copy === "failed"
                ? "errorReport.deviceCopyFailed"
                : "errorReport.deviceCopy",
          )}
        </Button>
      </div>
      <div className={styles.deviceFooter}>
        <p className={styles.deviceWaiting} role="status">
          {t("errorReport.deviceWaiting")}
        </p>
        {/* Reopening the approval page is the footer's primary action. */}
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </section>
  );
}
