import type { ChapterSnapshot } from "../../../../shared/libraryTypes";
import type { TranslationBlock } from "../../../../shared/textTypes";
import type {
  ImportReviewTextRequest,
  ImportReviewTextResult,
} from "../../../../shared/reviewTypes";
import { parseReviewTable } from "../../../../shared/reviewTable";
import { planReviewImport } from "../../../../shared/reviewImportPlan";
import type { UpdateCurrentChapter } from "../../hooks/useCurrentChapterUpdater";
import { appI18n } from "../../appI18n";

export function applyReviewTextImport(
  chapter: ChapterSnapshot | null,
  request: ImportReviewTextRequest,
  updateCurrentChapter: UpdateCurrentChapter,
): ImportReviewTextResult {
  if (!chapter || chapter.id !== request.chapterId)
    throw new Error("가져올 회차가 변경되었습니다.");
  const plan = planReviewImport(
    chapter,
    parseReviewTable(request.content, request.format),
    request,
  );
  const byPage = new Map<string, Map<string, TranslationBlock>>();
  for (const row of plan.rows) {
    if (row.result !== "updated" || !row.pageId || !row.after) continue;
    const blocks =
      byPage.get(row.pageId) ?? new Map<string, TranslationBlock>();
    blocks.set(row.blockId, row.after);
    byPage.set(row.pageId, blocks);
  }
  const dirtyPageIds = [...byPage.keys()];
  let result = chapter;
  if (dirtyPageIds.length)
    updateCurrentChapter(
      dirtyPageIds[0],
      (current) => {
        if (current !== chapter)
          throw new Error("가져오는 동안 편집 내용이 변경되었습니다.");
        result = {
          ...current,
          pages: current.pages.map((page) => {
            const blocks = byPage.get(page.id);
            return blocks
              ? {
                  ...page,
                  blocks: page.blocks.map(
                    (block) => blocks.get(block.id) ?? block,
                  ),
                }
              : page;
          }),
        };
        return result;
      },
      {
        dirtyPageIds,
        label: appI18n.t("workspaceHistory.importText", { ns: "renderer" }),
      },
    );
  return {
    chapter: result,
    updatedBlockCount: plan.updatedBlockCount,
    skippedRowCount: plan.skippedRowCount,
    warnings: plan.diagnostics.map(({ key, values }) =>
      appI18n.t(key, { ns: "main", ...values }),
    ),
  };
}
