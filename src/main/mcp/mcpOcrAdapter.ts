import type { MangaPage } from "../../shared/libraryTypes";
import type { InpaintingJobContext } from "../jobs/inpaintingJobTypes";
import type { JobEvent } from "../../shared/jobTypes";
import { getRunPaths } from "../library";
import { getAppSettings } from "../settingsStore";
import { buildBaseOptions } from "../pipeline/options";
import type { McpOperationContext } from "../application/mcpOperationService";
import { mcpOcrReadingBlocks } from "../application/mcpOcrReadingPolicy";
import { collectMcpWorkflowOcrBatch } from "./mcpWorkflowOcrBatch";

export async function recognizeMcpPage(
  app: InpaintingJobContext,
  chapterId: string,
  page: MangaPage,
  operation: McpOperationContext,
  emit: (event: JobEvent) => void,
) {
  operation.assertAuthorized();
  const { prepareOcrHintsForPages } = await import("../pipeline/ocrHints.js");
  const { loadTranslationRuntimePort, disposeTranslationRuntimeResources } =
    await import("../translationRuntime.js");
  operation.assertAuthorized();
  const settings = await getAppSettings(app.appPaths);
  const runPaths = await getRunPaths(chapterId, operation.id);
  const baseOptions = buildBaseOptions(
    operation.id,
    runPaths.runDir,
    settings,
    app.appPaths,
  );
  operation.assertAuthorized();
  const runtime = loadTranslationRuntimePort();
  try {
    const collect = (pages: MangaPage[]) =>
      prepareOcrHintsForPages({
        runtime,
        baseOptions,
        pages,
        runPaths,
        jobId: operation.id,
        signal: operation.signal,
        emit,
      });
    const result =
      (await collectMcpWorkflowOcrBatch(
        app,
        chapterId,
        page,
        operation,
        collect,
      )) ?? (await collect([page])).get(page.id);
    operation.assertAuthorized();
    if (!result) throw new Error("OCR returned no page result.");
    return {
      blocks: mcpOcrReadingBlocks(page, result.hints),
      engine: baseOptions.ocrPipeline ?? "paddleocr",
      noTextDetected: result.noTextDetected === true,
      effectReviewCandidates: result.effectReviewRegions?.length ?? 0,
    };
  } finally {
    operation.progress({ phase: "releasing_model" });
    await disposeTranslationRuntimeResources("mcp-ocr-finished");
  }
}
