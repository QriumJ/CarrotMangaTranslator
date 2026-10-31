import React from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  IconDownload,
  IconFolderOpen,
  IconLayersSelected,
} from "@tabler/icons-react";
import type { LinkedWorkspaceStatus } from "../../../shared/linkedWorkspaceTypes";
import { getLinkedResultIssue } from "../lib/linkedResultsCommands";
import { Button } from "./ui/Button";
import type { ChapterTaskHubProps } from "./chapterTaskHubTypes";
import styles from "./ChapterOutputActions.module.css";

type ChapterOutputActionsProps = Pick<
  ChapterTaskHubProps,
  | "exportLabel"
  | "linkedWorkspaceStatus"
  | "linkedWorkspaceViewBusy"
  | "linkedWorkspaceOrganizing"
  | "onOpenExport"
  | "onOpenPsdExport"
  | "onOpenPreviousLinkedResults"
  | "onRetryLinkedResults"
  | "onViewLinkedResults"
  | "psdExportLabel"
  | "viewResultsLabel"
> & {
  /** False for no chapter or an empty chapter; selection does not matter. */
  available: boolean;
};

/**
 * Whole-chapter outputs. Export never depends on a selected page, and a linked
 * workspace adds its own result folder state and actions beside export.
 */
export function ChapterOutputActions(
  props: ChapterOutputActionsProps,
): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div
      className={styles.outputActions}
      role="group"
      aria-label={t("runPanel.outputActions")}
    >
      <div className={styles.exportRow}>
        <Button
          disabled={!props.available}
          fullWidth
          iconLeft={<IconDownload size={16} stroke={2.1} />}
          onClick={props.onOpenExport}
          size="sm"
        >
          {props.exportLabel}
        </Button>
        <Button
          disabled={!props.available}
          fullWidth
          iconLeft={<IconLayersSelected size={16} stroke={2.1} />}
          onClick={props.onOpenPsdExport}
          size="sm"
        >
          {props.psdExportLabel}
        </Button>
      </div>
      {props.linkedWorkspaceStatus?.connectionId ? (
        <LinkedResultsState {...props} status={props.linkedWorkspaceStatus} />
      ) : null}
    </div>
  );
}

function LinkedResultsState(
  props: ChapterOutputActionsProps & { status: LinkedWorkspaceStatus },
): React.JSX.Element {
  const { t } = useTranslation("components");
  const { status } = props;
  const moving =
    props.linkedWorkspaceOrganizing ||
    getLinkedResultIssue(status) === "moving";
  const tone = moving
    ? "busy"
    : status.organization?.state === "failed"
      ? "failed"
      : status.state;
  return (
    <>
      <div className={styles.linkedRow}>
        <small className={styles.statusText} data-tone={tone} role="status">
          {moving
            ? t("linkedResults.moving")
            : formatLinkedWorkspaceStatus(status, t)}
        </small>
        <Button
          aria-label={props.viewResultsLabel}
          iconLeft={<IconFolderOpen size={16} stroke={2.1} />}
          onClick={props.onViewLinkedResults}
          disabled={props.linkedWorkspaceViewBusy}
          size="sm"
          variant="ghost"
        >
          {props.linkedWorkspaceViewBusy
            ? t("inpainting.export.preparingResults")
            : props.viewResultsLabel}
        </Button>
      </div>
      {moving ? null : <LinkedResultsFailure {...props} />}
      {status.organization?.preservedRootPaths?.length ? (
        <IssueRow
          title={t("linkedResults.preserved")}
          tone="muted"
          action={t("linkedResults.openPrevious")}
          onAction={props.onOpenPreviousLinkedResults}
        />
      ) : null}
    </>
  );
}

/** A failed move can be retried here; a sync error shows its own reason. */
function LinkedResultsFailure({
  onRetryLinkedResults,
  status,
}: ChapterOutputActionsProps & {
  status: LinkedWorkspaceStatus;
}): React.JSX.Element | null {
  const { t } = useTranslation("components");
  if (status.organization?.state === "failed")
    return (
      <IssueRow
        title={t("linkedResults.moveFailed")}
        reason={status.organization.error}
        tone="danger"
        action={t("linkedResults.retry")}
        onAction={onRetryLinkedResults}
      />
    );
  return status.state === "failed" && status.lastError ? (
    <IssueRow title={status.lastError} tone="danger" />
  ) : null;
}

function IssueRow({
  action,
  onAction,
  reason,
  title,
  tone,
}: {
  action?: string;
  onAction?: () => void;
  reason?: string;
  title: string;
  tone: "danger" | "muted";
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const [expanded, setExpanded] = React.useState(false);
  const longReason = Boolean(reason && reason.length > 120);
  return (
    <div className={styles.issueRow} data-tone={tone}>
      <p role={tone === "danger" ? "alert" : undefined}>
        <span>{title}</span>
        {reason ? (
          <small className={styles.reason} data-expanded={expanded}>
            {reason}
          </small>
        ) : null}
        {longReason ? (
          <Button
            size="sm"
            variant="ghost"
            className={styles.detailsAction}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {t(
              expanded ? "linkedResults.hideDetails" : "linkedResults.details",
            )}
          </Button>
        ) : null}
      </p>
      {action && onAction ? (
        <Button onClick={onAction} size="sm" variant="ghost">
          {action}
        </Button>
      ) : null}
    </div>
  );
}

function formatLinkedWorkspaceStatus(
  status: LinkedWorkspaceStatus,
  t: TFunction<"components">,
): string {
  if (status.organization?.state === "failed")
    return t("linkedResults.savingPaused");
  if (status.state === "syncing") return t("inpainting.export.syncing");
  if (status.state === "pending") {
    return t("inpainting.export.pendingSync", { count: status.pendingCount });
  }
  if (status.state === "failed") return t("inpainting.export.syncFailed");
  if (status.state === "disabled") return t("inpainting.export.syncDisabled");
  return status.rootName
    ? t("linkedResults.savedIn", { name: status.rootName })
    : t("inpainting.export.synced");
}
