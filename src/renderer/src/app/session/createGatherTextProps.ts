import { resolveSourceReadingDirection } from "../../../../shared/translationLanguages";
import { resolveReadingDirection } from "../../../../shared/blockReadingOrder";
import { applyTranslatedTextUpdates } from "./applyTranslatedTextUpdates";
import { applyGatherTextFormatRequest } from "./applyGatherTextFormatRequest";
import type { AppSessionViewProps } from "./AppSessionView";
import type { AppSessionViewModel } from "./appSessionViewModel";
import { isChapterMutationBlocked } from "./workspaceActivity";
import { pendingPageEdits } from "../../lib/pageEditBarrier";
import { applyReviewTextImport } from "./applyReviewTextImport";

export function createGatherTextProps(
  model: AppSessionViewModel,
): AppSessionViewProps["gatherTextProps"] {
  const {
    core,
    derivedState,
    persistence,
    pageNavigationHandlers,
    settingsDialog,
    uiState,
    updateCurrentChapter,
  } = model;
  const mutationDisabled = isChapterMutationBlocked(model);
  return uiState.textViewOpen
    ? {
        blockStylePresets: settingsDialog.settings?.blockStylePresets ?? [],
        chapter: core.currentChapter,
        formatApplyDisabled: mutationDisabled,
        onApplyFormat: (request) => {
          if (isChapterMutationBlocked(model)) return;
          applyGatherTextFormatRequest(
            core.currentChapter,
            request,
            updateCurrentChapter,
          );
        },
        onApplyTranslatedText: (updates, expectedChapter) => {
          if (isChapterMutationBlocked(model))
            throw new Error("페이지 처리 중에는 가져올 수 없습니다.");
          if (core.currentChapterRef.current !== expectedChapter)
            throw new Error(
              "가져오는 동안 회차 또는 편집 내용이 변경되었습니다. 다시 불러오세요.",
            );
          applyTranslatedTextUpdates(updates, updateCurrentChapter);
        },
        onImportReviewText: async (request) => {
          await pendingPageEdits.flushEnvironment();
          if (isChapterMutationBlocked(model))
            throw new Error("페이지 처리 중에는 가져올 수 없습니다.");
          const result = applyReviewTextImport(
            core.currentChapterRef.current,
            request,
            updateCurrentChapter,
          );
          await persistence.saveNow();
          return result;
        },
        onClose: () => uiState.setTextViewOpen(false),
        onOpenBatchEdit: (initialFind) => {
          uiState.setConditionalBatchInitialFind(initialFind?.trim() ?? "");
          uiState.setConditionalBatchInitialReplace("");
          uiState.setConditionalBatchOpen(true);
        },
        onNavigateToBlock: (pageId, blockId) => {
          pageNavigationHandlers.selectPageForReading(pageId);
          core.selectedBlockIdRef.current = blockId;
          core.setSelectedBlockId(blockId);
          core.setSelectedBlockIds([blockId]);
          uiState.setRightRailMode("block-editor");
          uiState.setTextViewOpen(false);
        },
        page: derivedState.selectedPage,
        readingDirection: resolveReadingDirection(
          core.library.works.find(
            (work) => work.id === core.currentChapter?.workId,
          )?.readingDirection,
          resolveSourceReadingDirection(
            settingsDialog.settings?.translation?.sourceLanguage,
          ),
        ),
      }
    : null;
}
