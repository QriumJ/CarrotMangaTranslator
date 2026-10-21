import type { PanelSessionValue } from "../../panels/panelSession";
import type { AppSessionViewModel } from "./appSessionViewModel";

type PanelBlockActions = Pick<
  PanelSessionValue,
  "onEraseBlockOriginal" | "onFitBlockBubble" | "onApplyBubblePadding"
>;

export function createPanelBlockActions({
  derivedState,
  inpaintingActions,
}: AppSessionViewModel): PanelBlockActions {
  return {
    onEraseBlockOriginal: () => {
      const blockId = derivedState.selectedBlock?.id;
      if (blockId) void inpaintingActions.runInpainting("page", blockId);
    },
    onFitBlockBubble: () => {
      const blockId = derivedState.selectedBlock?.id;
      if (blockId) void inpaintingActions.runBubbleLayout(blockId);
    },
    onApplyBubblePadding: (paddingRatio) => {
      const blockIds = derivedState.selectedBlockIds.length
        ? derivedState.selectedBlockIds
        : derivedState.selectedBlock
          ? [derivedState.selectedBlock.id]
          : [];
      if (blockIds.length)
        void inpaintingActions.runBubbleLayout(undefined, {
          blockIds,
          paddingRatio,
        });
    },
  };
}
