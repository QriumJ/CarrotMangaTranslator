import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MangaPage } from "../../shared/libraryTypes";
import type { PixelRect } from "../../shared/region";
import { bboxToPixels } from "../../shared/geometry";
import type { McpBlockOcrObservation } from "../../shared/mcpBlockOcr";
import type { InpaintingJobContext } from "../jobs/inpaintingJobTypes";
import type { McpOperationContext } from "../application/mcpOperationService";
import { McpEditError } from "../application/mcpEditPolicy";
import { mcpOcrReadingBlocks } from "../application/mcpOcrReadingPolicy";
import { loadPageImageSnapshot } from "../inpainting/imageIO";
import { probePageExportSourceImage } from "../pageExportRasterSafety";
import { getRunPaths } from "../library";
import { getAppSettings } from "../settingsStore";
import { buildBaseOptions } from "../pipeline/options";
import { joinCropOcrTexts } from "../pipeline/keepBlocksOcr";
import type { TranslationRuntimePort } from "../pipeline/translationRuntimePort";
import type { OcrBboxResult } from "../pipeline/types";

type Runtime = {
  collect: TranslationRuntimePort["collectOcrHints"];
  collectBatch?: TranslationRuntimePort["collectOcrHintsBatch"];
  release: (reason: string) => Promise<unknown>;
};
async function loadProductionRuntime(
  assertAuthorized: () => void,
): Promise<Runtime> {
  const { loadTranslationRuntimePort, disposeTranslationRuntimeResources } =
    await import("../translationRuntime.js");
  assertAuthorized();
  const runtime = loadTranslationRuntimePort();
  return {
    collect: runtime.collectOcrHints,
    collectBatch: runtime.collectOcrHintsBatch,
    release: disposeTranslationRuntimeResources,
  };
}

/** Local OCR only, fresh per-job input/output paths. No page OCR cache is read or
 * written. The sole temporary directory is removed after runtime cleanup. */
export async function recognizeMcpBlock(
  app: InpaintingJobContext,
  chapterId: string,
  page: MangaPage,
  cropRect: PixelRect,
  operation: McpOperationContext,
  runtime?: Runtime,
  overrides: {
    sourceLanguage?: string;
    ocrInputKind?: "page" | "known-block-crop";
  } = {},
) {
  const results = await recognizeMcpBlocks(
    app,
    chapterId,
    [{ page, cropRect, overrides }],
    operation,
    runtime,
  );
  return results[0];
}

type CropInput = {
  page: MangaPage;
  cropRect: PixelRect;
  overrides?: {
    sourceLanguage?: string;
    ocrInputKind?: "page" | "known-block-crop";
  };
};

export async function recognizeMcpBlocks(
  app: InpaintingJobContext,
  chapterId: string,
  inputs: CropInput[],
  operation: McpOperationContext,
  runtime?: Runtime,
) {
  operation.assertAuthorized();
  if (!inputs.length) return [];
  if (runtime === undefined) {
    runtime = await loadProductionRuntime(operation.assertAuthorized);
    operation.assertAuthorized();
  }
  const settings = await getAppSettings(app.appPaths);
  const runPaths = await getRunPaths(chapterId, operation.id);
  operation.assertAuthorized();
  await mkdir(runPaths.runDir, { recursive: true });
  const directory = await mkdtemp(join(runPaths.runDir, "block-ocr-"));
  const failures: unknown[] = [];
  let evidence: Awaited<ReturnType<typeof collectCrops>> | undefined;
  try {
    evidence = await collectCrops(app, inputs, operation, {
      directory,
      options: {
        ...buildBaseOptions(operation.id, directory, settings, app.appPaths),
      },
      runtime,
    });
  } catch (error) {
    failures.push(error);
  }
  try {
    operation.progress({ phase: "releasing_model" });
  } catch (error) {
    failures.push(error);
  }
  try {
    await runtime.release("mcp-block-ocr-finished");
  } catch (error) {
    failures.push(error);
  }
  try {
    await rm(directory, { recursive: true, force: true });
  } catch (error) {
    failures.push(error);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(
      failures,
      "Block OCR and its cleanup did not finish.",
    );
  operation.assertAuthorized();
  if (!evidence) throw new Error("Block OCR returned no observation.");
  return evidence;
}

async function collectCrops(
  app: InpaintingJobContext,
  inputs: CropInput[],
  operation: McpOperationContext,
  input: {
    directory: string;
    options: Parameters<Runtime["collect"]>[0];
    runtime: Runtime;
  },
) {
  const { crops, sources } = await prepareCrops(app, inputs, operation, input);
  const options = crops.map((crop) => crop.options);
  let results: OcrBboxResult[];
  if (options.length === 1) results = [await input.runtime.collect(options[0])];
  else if (input.runtime.collectBatch)
    results = await input.runtime.collectBatch(options);
  else throw new Error("Selected OCR requires a native batch transport.");
  operation.assertAuthorized();
  if (results.length !== crops.length)
    throw new Error("OCR batch returned an incomplete result.");
  for (const [path, hash] of sources) {
    const after = await readFile(path, { signal: operation.signal });
    if (createHash("sha256").update(after).digest("hex") !== hash)
      throw new McpEditError(
        "revision_conflict",
        "Original image changed during OCR. Read it again.",
      );
  }
  return crops.map((crop, index) => crop.finish(results[index]));
}

async function prepareCrops(
  app: InpaintingJobContext,
  inputs: CropInput[],
  operation: McpOperationContext,
  input: { directory: string; options: Parameters<Runtime["collect"]>[0] },
) {
  const crops: Awaited<ReturnType<typeof readCrop>>[] = [];
  const sources = new Map<string, string>();
  let lastPage: MangaPage | undefined;
  let snapshot: Awaited<ReturnType<typeof readSourceSnapshot>> | undefined;
  for (const [index, target] of inputs.entries()) {
    operation.assertAuthorized();
    if (!snapshot || lastPage !== target.page) {
      snapshot = await readSourceSnapshot(app, target.page, operation);
      lastPage = target.page;
      sources.set(target.page.imagePath, snapshot.sourceHash);
    }
    const directory = join(input.directory, String(index));
    await mkdir(directory);
    crops.push(
      await readCrop(
        target.page,
        target.cropRect,
        operation,
        {
          directory,
          options: { ...input.options, ...target.overrides },
        },
        snapshot.image,
      ),
    );
  }
  return { crops, sources };
}

async function readCrop(
  page: MangaPage,
  cropRect: PixelRect,
  operation: McpOperationContext,
  input: {
    directory: string;
    options: Parameters<Runtime["collect"]>[0];
  },
  image: Awaited<ReturnType<typeof readSourceSnapshot>>["image"],
) {
  const crop = image.crop({
    x: cropRect.x,
    y: cropRect.y,
    width: cropRect.w,
    height: cropRect.h,
  });
  const cropSize = crop.getSize();
  if (
    crop.isEmpty() ||
    cropSize.width !== cropRect.w ||
    cropSize.height !== cropRect.h
  )
    throw new McpEditError(
      "invalid_edit",
      "The requested source crop could not be decoded exactly.",
    );
  const bytes = crop.toPNG();
  const imagePath = join(input.directory, "source.png");
  operation.assertAuthorized();
  await writeFile(imagePath, bytes, { flag: "wx", signal: operation.signal });
  operation.assertAuthorized();
  operation.progress({ phase: "ocr_running", completed: 0, total: 1 });
  const options = {
    ...input.options,
    imagePath,
    imageWidth: cropRect.w,
    imageHeight: cropRect.h,
    outputDir: join(input.directory, "ocr"),
    label: "mcp-block-ocr",
    skipOcrBboxHints: false,
    ocrInputKind: input.options.ocrInputKind ?? "known-block-crop",
    abortSignal: operation.signal,
    onProgress: () =>
      operation.progress({ phase: "ocr_running", completed: 0, total: 1 }),
  };
  const sourceCropSha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    options,
    finish: (result: OcrBboxResult) => ({
      ...cropEvidence(page, cropRect, result, options.sourceLanguage),
      sourceCropSha256,
      sourceLanguage: options.sourceLanguage ?? "auto",
      engine: options.ocrPipeline ?? "paddleocr",
    }),
  };
}

function cropEvidence(
  page: MangaPage,
  rect: PixelRect,
  result: OcrBboxResult,
  language: string | undefined,
) {
  const effects = result.effectReviewRegions ?? [];
  if (result.hints.length + effects.length > 100)
    throw new McpEditError(
      "invalid_edit",
      "Too many regions in the selected block. No text was truncated or saved.",
    );
  const hints = [
    ...result.hints,
    ...effects.map((effect) => {
      const box = bboxToPixels(effect.bbox, rect.w, rect.h);
      return {
        x1: box.x,
        y1: box.y,
        x2: box.x + box.w,
        y2: box.y + box.h,
        ocrText: effect.recognizedText ?? "",
        rolePrior: "sound",
      };
    }),
  ];
  const blocks = mcpOcrReadingBlocks(
    { ...page, width: rect.w, height: rect.h },
    hints,
  );
  const regions: McpBlockOcrObservation["regions"] = blocks.map(
    (block, sequence) => ({
      sequence,
      sourceText: block.sourceText,
      sourceRect: {
        ...block.sourceRect,
        x: block.sourceRect.x + rect.x,
        y: block.sourceRect.y + rect.y,
      },
      sourceDirection: block.sourceDirection ?? "horizontal",
      textRole: block.textRole ?? "ordinary",
    }),
  );
  const recognizedText = joinCropOcrTexts(
    blocks.map((block) => ({
      x1: block.sourceRect.x,
      y1: block.sourceRect.y,
      x2: block.sourceRect.x + block.sourceRect.w,
      y2: block.sourceRect.y + block.sourceRect.h,
      ocrText: block.sourceText,
    })),
    language,
  );
  return { recognizedText, regions };
}

async function readSourceSnapshot(
  app: InpaintingJobContext,
  page: MangaPage,
  operation: McpOperationContext,
) {
  const size = await probePageExportSourceImage(
    page.imagePath,
    operation.signal,
  );
  if (size.width !== page.width || size.height !== page.height)
    throw new McpEditError(
      "revision_conflict",
      "Original image dimensions changed. Reload the page.",
    );
  const source = await readFile(page.imagePath, { signal: operation.signal });
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const image = await loadPageImageSnapshot(
    page.imagePath,
    source,
    app.decodeImage,
    operation.signal,
  );
  const actualSize = image.getSize();
  if (actualSize.width !== page.width || actualSize.height !== page.height)
    throw new McpEditError(
      "revision_conflict",
      "Decoded source dimensions do not match the page.",
    );
  return { image, sourceHash };
}
