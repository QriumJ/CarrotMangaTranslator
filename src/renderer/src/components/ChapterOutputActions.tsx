import React from "react";
import { useTranslation } from "react-i18next";
import {
  IconDownload,
  IconFolderOpen,
  IconLayersSelected,
} from "@tabler/icons-react";
import { Button } from "./ui/Button";
import type { ChapterTaskHubProps } from "./chapterTaskHubTypes";
import styles from "./ChapterOutputActions.module.css";

type ChapterOutputActionsProps = Pick<
  ChapterTaskHubProps,
  | "exportLabel"
  | "linkedWorkspaceStatus"
  | "linkedWorkspaceViewBusy"
  | "onOpenExport"
  | "onOpenPsdExport"
  | "onViewLinkedResults"
  | "psdExportLabel"
> & {
  /** False for no chapter or an empty chapter; selection does not matter. */
  available: boolean;
};

/**
 * Whole-chapter outputs. Export never depends on a selected page, and a linked
 * workspace adds its own "view results" entry instead of replacing export.
 */
export function ChapterOutputActions(
  props: ChapterOutputActionsProps,
): React.JSX.Element {
  const { t } = useTranslation("components");
  const status = props.linkedWorkspaceStatus;
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
      {status?.connectionId ? (
        <div className={styles.linkedRow}>
          <small className={`linked-workspace-inline-status ${status.state}`}>
            {formatLinkedWorkspaceStatus(status, t)}
          </small>
          {canViewLinkedResults(status) ? (
            <Button
              aria-label={t("inpainting.export.viewResults")}
              iconLeft={<IconFolderOpen size={16} stroke={2.1} />}
              onClick={props.onViewLinkedResults}
              size="sm"
              variant="ghost"
            >
              {props.linkedWorkspaceViewBusy
                ? t("inpainting.export.preparingResults")
                : t("inpainting.export.viewResults")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function canViewLinkedResults(
  status: NonNullable<ChapterTaskHubProps["linkedWorkspaceStatus"]>,
): boolean {
  return !["disabled", "unlinked"].includes(status.state);
}

function formatLinkedWorkspaceStatus(
  status: NonNullable<ChapterTaskHubProps["linkedWorkspaceStatus"]>,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (status.state === "syncing") return t("inpainting.export.syncing");
  if (status.state === "pending") {
    return t("inpainting.export.pendingSync", { count: status.pendingCount });
  }
  if (status.state === "failed") return t("inpainting.export.syncFailed");
  if (status.state === "disabled") return t("inpainting.export.syncDisabled");
  return t("inpainting.export.synced");
}
