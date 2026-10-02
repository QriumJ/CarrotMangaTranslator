import type { McpContextSnapshot } from "../application/mcpContextEditPolicy";
import type { McpOperationContext } from "../application/mcpOperationService";
import type { InpaintingJobContext } from "../jobs/inpaintingJobTypes";
import type { MangaPage } from "../../shared/libraryTypes";
import type {
  McpSelectionOcr,
  McpSelectionAnalysisItem,
} from "../../shared/mcpSelectionAnalysis";
import {
  buildMcpOcrObservation,
  selectMcpBlockOcr,
  selectMcpSourceCrop,
} from "../application/mcpBlockOcrService";
import { requireBatchPage } from "../application/mcpPageBatchPolicy";
import { bboxToPixels, bboxOverlapRatio } from "../../shared/geometry";
import { recognizeMcpBlocks } from "./mcpBlockOcrAdapter";

type Runtime = Parameters<typeof recognizeMcpBlocks>[4];
type Selected = ReturnType<typeof selectPages>[number];
export async function analyzeMcpSelectionOcr(
  app: InpaintingJobContext,
  saved: McpContextSnapshot,
  input: McpSelectionOcr,
  context: McpOperationContext,
  runtime?: Runtime,
) {
  const items: McpSelectionAnalysisItem[] = [];
  const total = input.pages.reduce((n, page) => n + page.targets.length, 0);
  const pages = selectPages(saved, input);
  const crops = pages.flatMap(({ page, targets }) =>
    targets
      .filter(
        ({ entry }) =>
          entry.kind !== "block" ||
          !page.blocks.find((block) => block.id === entry.blockId)
            ?.generatedLettering,
      )
      .map(({ entry, selected }) => ({
        page,
        cropRect: selected.cropRect,
        overrides: {
          ...(input.sourceLanguage
            ? { sourceLanguage: input.sourceLanguage }
            : {}),
          ocrInputKind:
            entry.kind === "block"
              ? ("known-block-crop" as const)
              : ("page" as const),
        },
      })),
  );
  const evidence = await recognizeMcpBlocks(
    app,
    input.chapterId,
    crops,
    context,
    runtime,
  );
  let evidenceIndex = 0;
  for (const page of pages) {
    for (const target of page.targets) {
      items.push(
        observeTarget(
          page,
          target,
          () => evidence[evidenceIndex++],
          items.length,
        ),
      );
      context.progress({
        phase: "selected_ocr",
        completed: items.length,
        total,
      });
    }
  }
  return items;
}
function selectPages(saved: McpContextSnapshot, input: McpSelectionOcr) {
  // Validate every target before the first model invocation.
  return input.pages.map((target) => {
    const page = requireBatchPage(saved.chapter, { ...target, edits: [] });
    const targets = target.targets.map((entry) => ({
      entry,
      selected:
        entry.kind === "block"
          ? selectMcpBlockOcr(page, entry.blockId)
          : selectMcpSourceCrop(page, entry.sourceRect),
    }));
    return { target, page, targets };
  });
}
function observeTarget(
  pageTarget: Selected,
  selectedTarget: Selected["targets"][number],
  readEvidence: () => Awaited<ReturnType<typeof recognizeMcpBlocks>>[number],
  index: number,
): McpSelectionAnalysisItem {
  const { target, page } = pageTarget;
  const { entry, selected } = selectedTarget;
  const block =
    entry.kind === "block"
      ? page.blocks.find((block) => block.id === entry.blockId)
      : null;
  const item: McpSelectionAnalysisItem = {
    itemId: `item-${index + 1}`,
    pageId: page.id,
    revision: target.revision,
    blockId: entry.kind === "block" ? entry.blockId : null,
    regionId: entry.kind === "region" ? entry.regionId : null,
    excludedReason: block?.generatedLettering ? "generated_lettering" : null,
    engine: null,
    ocr: null,
    translation: null,
    overlaps: [],
  };
  if (item.excludedReason) return item;
  const evidence = readEvidence();
  const { engine, ...observation } = evidence;
  item.engine = engine;
  item.ocr = buildMcpOcrObservation(selected, observation);
  item.overlaps = overlaps(page, item.ocr.regions);
  return item;
}
function overlaps(
  page: MangaPage,
  regions: NonNullable<McpSelectionAnalysisItem["ocr"]>["regions"],
) {
  return regions.map((region) => ({
    sequence: region.sequence,
    blockIds: page.blocks
      .filter((block) => {
        const rect =
          block.bboxSpace === "pixels"
            ? block.bbox
            : bboxToPixels(block.bbox, page.width, page.height);
        return bboxOverlapRatio(region.sourceRect, rect) > 0;
      })
      .map((block) => block.id),
  }));
}
