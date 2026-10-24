import React from "react";
import { useTranslation } from "react-i18next";
import type { ErrorReportContext } from "../../../shared/errorReportTypes";
import styles from "./ErrorReportDialog.module.css";
import { Button } from "./ui/Button";
import { TextField, Textarea } from "./ui/Field";
import { Modal } from "./ui/Modal";
import { ModalActionBar, ModalActionButtons } from "./ui/ModalActionBar";
import {
  useErrorReportDialogModel,
  type ReportAction,
  type ReportPrimaryAction,
  type ErrorReportDialogModel,
} from "./useErrorReportDialog";
import { CheckboxField } from "./ui/CheckboxField";
import { GitHubReportAccount } from "./GitHubReportAccount";

export type ErrorReportDialogProps = {
  context: ErrorReportContext;
  onClose: () => void;
  fatal?: boolean;
  onRestart?: () => unknown | Promise<unknown>;
};

export function ErrorReportDialog({
  context,
  onClose,
  fatal = false,
  onRestart,
}: ErrorReportDialogProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const model = useErrorReportDialogModel(context, onRestart);
  const busy = model.activeAction !== null;

  return (
    <Modal
      title={t(fatal ? "errorReport.fatalTitle" : "errorReport.title")}
      size="lg"
      width="min(900px, 100%)"
      onClose={onClose}
      closeDisabled={busy}
      // Holds a typed report; a stray backdrop click must not discard it.
      // A fatal report is also the only way back to a usable app, so Esc is
      // disabled in that case too.
      closeOnEsc={!fatal}
      footer={
        <ErrorReportFooter
          activeAction={model.activeAction}
          canShare={model.canShare}
          primary={model.primaryAction}
          fatal={fatal}
          hasRestart={Boolean(onRestart)}
          onClose={onClose}
          onCopy={model.handleCopy}
          onOpenLogs={model.handleOpenLogs}
          onRestart={model.handleRestart}
        />
      }
    >
      {fatal ? (
        <p className={styles.fatalHint}>{t("errorReport.fatalHint")}</p>
      ) : null}
      <GitHubReportAccount model={model.githubAccount} disabled={busy} />
      <p className={styles.privacyNotice} role="note">
        <strong>{t("errorReport.privacyLabel")}</strong>{" "}
        {t("errorReport.privacyWarning")}
      </p>
      {model.loadError ? (
        <div className={styles.loadError} role="alert">
          <p>{t("errorReport.prepareError")}</p>
          <Button size="sm" onClick={model.retry}>
            {t("errorReport.retry")}
          </Button>
        </div>
      ) : model.draftReady ? (
        <fieldset
          className={styles.formGuard}
          disabled={busy || model.submissionStarted}
        >
          <ErrorReportForm
            description={model.description}
            includeLogs={model.includeLogs}
            includeSystem={model.includeSystem}
            reportBody={model.reportBody}
            title={model.title}
            onDescriptionChange={model.setDescription}
            onIncludeLogsChange={model.setIncludeLogs}
            onIncludeSystemChange={model.setIncludeSystem}
            onTitleChange={model.setTitle}
          />
        </fieldset>
      ) : (
        <p className={styles.loading} role="status">
          {t("errorReport.preparing")}
        </p>
      )}
      <ErrorReportFeedback feedback={model.feedback} />
    </Modal>
  );
}

function ErrorReportFeedback({
  feedback,
}: {
  feedback: ErrorReportDialogModel["feedback"];
}) {
  if (!feedback) return null;
  return (
    <p
      className={
        feedback.kind === "error" ? styles.actionError : styles.actionSuccess
      }
      role={feedback.kind === "error" ? "alert" : "status"}
    >
      {feedback.message}
    </p>
  );
}

function ErrorReportForm({
  description,
  includeLogs,
  includeSystem,
  reportBody,
  title,
  onDescriptionChange,
  onIncludeLogsChange,
  onIncludeSystemChange,
  onTitleChange,
}: {
  description: string;
  includeLogs: boolean;
  includeSystem: boolean;
  reportBody: string;
  title: string;
  onDescriptionChange: (value: string) => void;
  onIncludeLogsChange: (value: boolean) => void;
  onIncludeSystemChange: (value: boolean) => void;
  onTitleChange: (value: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const descriptionId = React.useId();
  const previewId = React.useId();
  return (
    <div className={styles.form}>
      <TextField
        label={t("errorReport.issueTitle")}
        value={title}
        maxLength={180}
        required
        onChange={(event) => onTitleChange(event.target.value)}
      />
      <label className={styles.field} htmlFor={descriptionId}>
        <span>{t("errorReport.descriptionLabel")}</span>
        <Textarea
          id={descriptionId}
          value={description}
          rows={4}
          maxLength={1000}
          placeholder={t("errorReport.descriptionPlaceholder")}
          onChange={(event) => onDescriptionChange(event.target.value)}
        />
      </label>
      <fieldset className={styles.options}>
        <legend>{t("errorReport.includeHeading")}</legend>
        <CheckboxField
          label={t("errorReport.includeSystem")}
          checked={includeSystem}
          onCheckedChange={onIncludeSystemChange}
        />
        <CheckboxField
          label={t("errorReport.includeLogs")}
          checked={includeLogs}
          onCheckedChange={onIncludeLogsChange}
        />
      </fieldset>
      <label className={styles.field} htmlFor={previewId}>
        <span>{t("errorReport.preview")}</span>
        <Textarea
          id={previewId}
          className={styles.preview}
          value={reportBody}
          rows={12}
          readOnly
          spellCheck={false}
        />
      </label>
    </div>
  );
}

type ErrorReportFooterProps = {
  activeAction: ReportAction | null;
  canShare: boolean;
  primary: ReportPrimaryAction;
  fatal: boolean;
  hasRestart: boolean;
  onClose: () => void;
  onCopy: () => void;
  onOpenLogs: () => void;
  onRestart: () => void;
};

function ErrorReportFooter({
  activeAction,
  canShare,
  primary,
  fatal,
  hasRestart,
  onClose,
  onCopy,
  onOpenLogs,
  onRestart,
}: ErrorReportFooterProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const busy = activeAction !== null;
  return (
    <ModalActionBar
      leading={
        <>
          <Button
            className={styles.footerButton}
            onClick={onOpenLogs}
            disabled={busy}
          >
            {activeAction === "logs"
              ? t("errorReport.openingLogs")
              : t("errorReport.openLogs")}
          </Button>
          <Button
            className={styles.footerButton}
            onClick={onCopy}
            disabled={!canShare}
          >
            {activeAction === "copy"
              ? t("errorReport.copying")
              : t("errorReport.copy")}
          </Button>
        </>
      }
      actions={
        <>
          {fatal && hasRestart ? (
            <Button
              className={styles.footerButton}
              onClick={onRestart}
              disabled={busy}
            >
              {activeAction === "restart"
                ? t("errorReport.restarting")
                : t("errorReport.restart")}
            </Button>
          ) : null}
          <ModalActionButtons
            cancel={{
              label: t("common.close"),
              onClick: onClose,
              disabled: busy,
            }}
            confirm={{
              label: t(`errorReport.${primary.label}`),
              onClick: primary.run,
              disabled: primary.disabled,
            }}
          />
        </>
      }
    />
  );
}
