import { useCallback } from "react";

import { useTranslation } from "react-i18next";

import type { WorkspaceHistoryController } from "../../hooks/useWorkspaceHistory";

import { captureWorkspaceMaskSnapshot } from "../../lib/workspaceHistory";

import { adjustMaskStrokeRadii } from "../../hooks/workspaceInpaintingPointerState";

import type { AppSessionCoreState } from "./useAppSessionCoreState";

import type { useAppSessionDerivedState } from "./useAppSessionDerivedState";

import type { useAppSessionUiState } from "./useAppSessionUiState";

export function useAdjustSelectedPatternMask({
  core,
  derivedState,
  uiState,
  workspaceHistory,
}: AppSessionPatternMaskArgs): (deltaPx: number) => void {
  const { t } = useTranslation("renderer");
  return useCallback(
    (deltaPx) => {
      const selectedPage = derivedState.selectedPage;
      const chapterId = core.currentChapter?.id;
      const before = derivedState.patternMaskStrokes;
      if (!selectedPage || !chapterId || before.length === 0) return;
      const after = adjustMaskStrokeRadii(before, deltaPx);
      if (
        after.length === before.length &&
        after.every(
          (stroke, index) => stroke.radiusPx === before[index]?.radiusPx,
        )
      ) {
        return;
      }
      const next = { ...uiState.patternMaskStrokesByPage };
      if (after.length > 0) next[selectedPage.id] = after;
      else delete next[selectedPage.id];
      uiState.setPatternMaskStrokesByPage(next);
      workspaceHistory.recordMaskEdit({
        label: t("workspaceHistory.maskEdit"),
        before: captureWorkspaceMaskSnapshot(
          chapterId,
          selectedPage.id,
          before,
        ),
        after: captureWorkspaceMaskSnapshot(chapterId, selectedPage.id, after),
      });
    },
    [core.currentChapter?.id, derivedState, t, uiState, workspaceHistory],
  );
}

export function useClearSelectedPatternMask({
  core,
  derivedState,
  uiState,
  workspaceHistory,
}: AppSessionPatternMaskArgs): () => void {
  const { t } = useTranslation("renderer");
  return useCallback(() => {
    const selectedPage = derivedState.selectedPage;
    const chapterId = core.currentChapter?.id;
    const before = derivedState.patternMaskStrokes;
    if (!selectedPage || !chapterId || before.length === 0) {
      return;
    }
    const next = { ...uiState.patternMaskStrokesByPage };
    delete next[selectedPage.id];
    uiState.setPatternMaskStrokesByPage(next);
    workspaceHistory.recordMaskEdit({
      label: t("workspaceHistory.maskEdit"),
      before: captureWorkspaceMaskSnapshot(chapterId, selectedPage.id, before),
      after: captureWorkspaceMaskSnapshot(chapterId, selectedPage.id, []),
    });
  }, [core.currentChapter?.id, derivedState, t, uiState, workspaceHistory]);
}

type AppSessionPatternMaskArgs = {
  core: Pick<AppSessionCoreState, "currentChapter">;
  derivedState: Pick<
    ReturnType<typeof useAppSessionDerivedState>,
    "selectedPage" | "patternMaskStrokes"
  >;
  uiState: Pick<
    ReturnType<typeof useAppSessionUiState>,
    "patternMaskStrokesByPage" | "setPatternMaskStrokesByPage"
  >;
  workspaceHistory: Pick<WorkspaceHistoryController, "recordMaskEdit">;
};
