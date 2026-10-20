import { readFile } from "node:fs/promises";
import { nativeImage } from "electron";
import { PNG } from "pngjs";
import { z } from "zod";
import { pixelsToBbox } from "../../shared/bboxNormalization";
import type { HunyuanExecution } from "../../shared/hunyuanOcr";
import type { TranslationOptions } from "../appSettings";
import type { OcrBboxResult } from "./types";
import {
  HUNYUAN_REVISION,
  HUNYUAN_RUNTIME_VERSION,
} from "../runtimeSupport/hunyuanAssets";

const boxSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
const regionSchema = z.object({
  id: z.number().int().positive(),
  regionId: z.string().min(1),
  kind: z.enum(["dialogue", "effect"]),
  bbox: boxSchema,
  recognitionBboxes: z.array(boxSchema).min(2).max(8).optional(),
  detectorConfidence: z.number().finite(),
  sourceDetectionIds: z.array(z.string()),
});
const manifestSchema = z.object({
  schemaVersion: z.literal("hayai-dialogue-effect-separated-v1"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  dialogueRegions: z.array(regionSchema),
  effectRegions: z.array(regionSchema),
});
type Region = z.infer<typeof regionSchema>;
type Manifest = z.infer<typeof manifestSchema>;
export type HunyuanRegionText = {
  text: string;
  execution: HunyuanExecution;
};

export async function readHunyuanRegions(options: TranslationOptions) {
  if (!options.ocrBboxRegionsPath)
    throw new Error("HunyuanOCR 고정 영역 입력이 필요합니다.");
  options.abortSignal?.throwIfAborted();
  const manifest = manifestSchema.parse(
    JSON.parse(await readFile(options.ocrBboxRegionsPath, "utf8")),
  );
  validateRegions(manifest);
  const image = nativeImage.createFromBuffer(await readFile(options.imagePath));
  const size = image.getSize();
  if (
    image.isEmpty() ||
    size.width !== manifest.width ||
    size.height !== manifest.height
  )
    throw new Error(
      "HunyuanOCR region dimensions do not match the source image.",
    );
  return {
    manifest,
    crop(box: Region["bbox"]) {
      const x = Math.floor(box[0]),
        y = Math.floor(box[1]);
      const width = Math.ceil(box[2]) - x,
        height = Math.ceil(box[3]) - y;
      const source = PNG.sync.read(image.crop({ x, y, width, height }).toPNG());
      const padded = new PNG({ width: width + 32, height: height + 32 });
      padded.data.fill(255);
      PNG.bitblt(source, padded, 0, 0, width, height, 16, 16);
      return `data:image/png;base64,${PNG.sync.write(padded).toString("base64")}`;
    },
  };
}

function validateRegions(manifest: Manifest) {
  const ids = new Set<string>();
  for (const [regions, kind] of [
    [manifest.dialogueRegions, "dialogue"],
    [manifest.effectRegions, "effect"],
  ] as const) {
    for (const region of regions) {
      if (region.kind !== kind || ids.has(region.regionId))
        throw new Error("Invalid HunyuanOCR region identity.");
      ids.add(region.regionId);
      validateBoxes(region, manifest);
    }
  }
}

function validateBoxes(region: Region, manifest: Manifest) {
  for (const [x1, y1, x2, y2] of [
    region.bbox,
    ...(region.recognitionBboxes ?? []),
  ]) {
    if (
      x1 < 0 ||
      y1 < 0 ||
      x2 > manifest.width ||
      y2 > manifest.height ||
      x2 <= x1 ||
      y2 <= y1
    )
      throw new Error("Invalid HunyuanOCR region coordinates.");
  }
}

export async function recognizeHunyuanRegions(
  source: Awaited<ReturnType<typeof readHunyuanRegions>>,
  recognize: (image: string) => Promise<HunyuanRegionText>,
): Promise<OcrBboxResult> {
  const texts = new Map<string, HunyuanRegionText[]>();
  const { manifest } = source;
  for (const region of [
    ...manifest.dialogueRegions,
    ...manifest.effectRegions,
  ]) {
    const parts: HunyuanRegionText[] = [];
    for (const box of region.recognitionBboxes ?? [region.bbox]) {
      parts.push(await recognize(source.crop(box)));
    }
    texts.set(region.regionId, parts);
  }
  const hints = manifest.dialogueRegions.map((region) =>
    dialogueHint(region, requireText(texts, region.regionId)),
  );
  return {
    hints,
    effectReviewRegions: manifest.effectRegions.map((region) => ({
      id: region.regionId,
      bbox: pixelsToBbox(
        {
          x: region.bbox[0],
          y: region.bbox[1],
          w: region.bbox[2] - region.bbox[0],
          h: region.bbox[3] - region.bbox[1],
        },
        manifest.width,
        manifest.height,
      ),
      detectorConfidence: region.detectorConfidence,
      sourceDetectionIds: region.sourceDetectionIds,
      recognizedText: joinText(requireText(texts, region.regionId)),
    })),
    diagnostics: [
      {
        provider: "hunyuan-regions",
        modelRevision: HUNYUAN_REVISION,
        runtime: HUNYUAN_RUNTIME_VERSION,
        regions: [...texts].map(([regionId, parts]) => ({
          regionId,
          executions: parts.map((part) => part.execution),
        })),
      },
    ],
    noTextDetected: hints.length === 0,
    textEvidenceCount: hints.filter((hint) => hint.ocrText).length,
  };
}

function requireText(texts: Map<string, HunyuanRegionText[]>, id: string) {
  const parts = texts.get(id);
  if (!parts) throw new Error(`HunyuanOCR region result missing: ${id}`);
  return parts;
}

function dialogueHint(region: Region, parts: HunyuanRegionText[]) {
  return {
    id: region.id,
    label: "text",
    x1: region.bbox[0],
    y1: region.bbox[1],
    x2: region.bbox[2],
    y2: region.bbox[3],
    score: region.detectorConfidence,
    ocrText: joinText(parts),
    reviewFragmentId: `B${String(region.id).padStart(4, "0")}`,
    reviewStatus: "confirmed",
    reviewOrder: 1,
    geometryLocked: true,
    sourceDetectionIds: region.sourceDetectionIds,
    ocrEngine: "hunyuan",
    modelRevision: HUNYUAN_REVISION,
    runtimeVersion: HUNYUAN_RUNTIME_VERSION,
    executions: parts.map((part) => part.execution),
    ...(region.recognitionBboxes
      ? {
          recognitionSegments: region.recognitionBboxes.map((box, index) => ({
            x1: box[0],
            y1: box[1],
            x2: box[2],
            y2: box[3],
            ocrText: parts[index].text,
          })),
        }
      : {}),
  };
}

function joinText(parts: HunyuanRegionText[]): string {
  return parts
    .map((part) => part.text.trim())
    .join("")
    .normalize("NFKC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
