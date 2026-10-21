import { useCallback } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { StartInpaintingRequest } from "../../../shared/inpaintingTypes";
import { inpaintingGateway } from "../api/inpaintingGateway";
import { formatErrorMessage } from "../lib/errorPresentation";
import {
  failInpaintingJob,
  refreshLibraryWithStatus,
  saveDirtyChangesOrReportFailure,
  type UseInpaintingActionsOptions,
} from "./inpaintingActionTypes";

/**
 * Selection-scoped run: re-detect every listed block with one explicit text
 * padding. Without it the active-block command keeps its stored padding.
 */
export type BubbleLayoutRunOptions = {
  blockIds?: readonly string[];
  paddingRatio?: number;
};

export function useRunBubbleLayoutAction(
  options: UseInpaintingActionsOptions,
): (blockId?: string, run?: BubbleLayoutRunOptions) => Promise<void> {
  const { t } = useTranslation("renderer");
  return useCallback(
    async (blockId, run) => runBubbleLayout(options, blockId, run, t),
    [options, t],
  );
}

async function runBubbleLayout(
  options: UseInpaintingActionsOptions,
  blockId: string | undefined,
  run: BubbleLayoutRunOptions | undefined,
  t: TFunction<"renderer">,
): Promise<void> {
  const chapter = options.currentChapter;
  const page = options.selectedPage;
  if (!chapter || !page || options.jobActive) return;
  // An explicit but empty selection must never widen to the whole page.
  const blockIds = run?.blockIds ? [...run.blockIds] : undefined;
  if (
    blockIds?.length === 0 ||
    !areBubbleLayoutTargetsAvailable(page.blocks, blockId, blockIds)
  ) {
    options.pushStatus(t("inpainting.bubbleLayout.requiresBlocks"));
    return;
  }
  if (!(await prepareBubbleLayout(options, t))) return;
  try {
    const result = await inpaintingGateway.startInpainting(
      buildBubbleLayoutRequest(chapter.id, page.id, blockId, blockIds, run),
    );
    applyBubbleLayoutResult(options, t, result, blockId, blockIds);
    void refreshLibraryWithStatus(
      options.refreshLibrary,
      options.pushStatus,
      t("library.refreshAfterJobFailed"),
    );
  } catch (error) {
    failInpaintingJob(
      options.setJobState,
      options.pushStatus,
      t("inpainting.bubbleLayout.failedTitle"),
      formatErrorMessage(error, t("inpainting.bubbleLayout.failed")),
    );
  }
}

function buildBubbleLayoutRequest(
  chapterId: string,
  pageId: string,
  blockId: string | undefined,
  blockIds: string[] | undefined,
  run: BubbleLayoutRunOptions | undefined,
): StartInpaintingRequest {
  return {
    chapterId,
    mode: "page-bubble-layout",
    pageId,
    policy: "balanced",
    blockId,
    ...(blockIds ? { blockIds } : {}),
    ...(run?.paddingRatio === undefined
      ? {}
      : { paddingRatio: run.paddingRatio }),
  };
}

function applyBubbleLayoutResult(
  options: UseInpaintingActionsOptions,
  t: TFunction<"renderer">,
  result: Awaited<ReturnType<typeof inpaintingGateway.startInpainting>>,
  blockId: string | undefined,
  blockIds: readonly string[] | undefined,
): void {
  if (result.chapter) {
    options.clearRetouchHistory();
    options.clearPageImageCache();
    options.mergeLiveChapter(result.chapter);
  }
  if (result.historyTransaction) {
    options.workspaceHistory.recordImageEdit({
      label: t("workspaceHistory.bubbleLayout"),
      transactionId: result.historyTransaction.transactionId,
    });
  }
  if (result.status === "completed" && blockIds) {
    reportSelectionLayoutCompleted(options, t, blockIds, result.blocksErased);
  } else if (result.status === "completed") {
    reportBubbleLayoutCompleted(options, t, blockId, result.blocksErased);
  } else if (result.status === "failed") {
    reportBubbleLayoutFailed(options, t, result.error);
  }
}

function reportBubbleLayoutFailed(
  options: UseInpaintingActionsOptions,
  t: TFunction<"renderer">,
  error: string | undefined,
): void {
  failInpaintingJob(
    options.setJobState,
    options.pushStatus,
    t("inpainting.bubbleLayout.failedTitle"),
    error?.trim() || t("inpainting.bubbleLayout.failed"),
  );
}

function reportBubbleLayoutCompleted(
  options: UseInpaintingActionsOptions,
  t: TFunction<"renderer">,
  blockId: string | undefined,
  blocksChanged: number | undefined,
): void {
  if (blockId && blocksChanged === 0) {
    options.pushStatus(t("inpainting.bubbleLayout.selectedBlockNoMatch"));
    return;
  }
  options.setShowBlockChrome(false);
  options.pushStatus(t(resolveBubbleLayoutSuccessKey(blockId)));
}

/**
 * `blocksErased` counts changed layouts, not detector matches, so the
 * selection report says how many changed; zero may mean already up to date.
 */
function reportSelectionLayoutCompleted(
  options: UseInpaintingActionsOptions,
  t: TFunction<"renderer">,
  blockIds: readonly string[],
  changed: number | undefined,
): void {
  if (changed) options.setShowBlockChrome(false);
  options.pushStatus(
    t("inpainting.bubbleLayout.selectionChanged", {
      count: blockIds.length,
      changed: changed ?? 0,
    }),
  );
}

/** Every requested block must still exist; a stale id runs nothing. */
function areBubbleLayoutTargetsAvailable(
  blocks: Array<{ id: string }>,
  blockId: string | undefined,
  blockIds: readonly string[] | undefined,
): boolean {
  const ids = new Set(blocks.map((block) => block.id));
  const requested = [...(blockId ? [blockId] : []), ...(blockIds ?? [])];
  return blocks.length > 0 && requested.every((id) => ids.has(id));
}

function resolveBubbleLayoutSuccessKey(
  blockId: string | undefined,
):
  | "inpainting.bubbleLayout.selectedBlockSuccess"
  | "inpainting.bubbleLayout.success" {
  return blockId
    ? "inpainting.bubbleLayout.selectedBlockSuccess"
    : "inpainting.bubbleLayout.success";
}

async function prepareBubbleLayout(
  options: UseInpaintingActionsOptions,
  t: TFunction<"renderer">,
): Promise<boolean> {
  const saved = await saveDirtyChangesOrReportFailure(
    options.dirty,
    options.saveNow,
    (error) =>
      failInpaintingJob(
        options.setJobState,
        options.pushStatus,
        t("inpainting.common.saveFailedTitle"),
        formatErrorMessage(error, t("inpainting.erase.saveFailed")),
      ),
  );
  if (!saved) return false;
  options.setPeekOriginal(false);
  options.setJobState({
    id: "pending-bubble-layout",
    kind: "inpainting",
    status: "starting",
    progressText: t("inpainting.bubbleLayout.preparing"),
    phase: "inpainting_preparing",
  });
  return true;
}
