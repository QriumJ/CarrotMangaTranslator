import type { OcrPipeline } from "./settingsTypes";

export const OCR_PIPELINES = ["hayai", "hunyuan", "paddle-legacy"] as const;

const OCR_ENGINE_PROFILES = {
  hunyuan: {
    displayName: "HunyuanOCR 1.5",
    bboxProvider: "hunyuan-regions",
    rendererKeyPrefix: "hunyuanOcr",
  },
  hayai: {
    displayName: "HayaiOCR",
    bboxProvider: "hayai-regions",
    rendererKeyPrefix: "hayaiOcr",
  },
  "paddle-legacy": {
    displayName: "PaddleOCR(레거시)",
    bboxProvider: "paddleocr",
    rendererKeyPrefix: "ocr",
  },
} as const satisfies Record<
  OcrPipeline,
  {
    displayName: string;
    bboxProvider: "hayai-regions" | "paddleocr" | "hunyuan-regions";
    rendererKeyPrefix: string;
  }
>;

export function isHayaiOcrPipeline(
  pipeline: OcrPipeline | null | undefined,
): pipeline is "hayai" {
  return pipeline === "hayai";
}

export function isRegionOcrPipeline(
  pipeline: OcrPipeline | null | undefined,
): pipeline is "hayai" | "hunyuan" {
  return pipeline === "hayai" || pipeline === "hunyuan";
}

export function resolveOcrPipeline(
  pipeline: OcrPipeline | null | undefined,
): OcrPipeline {
  return pipeline ?? "paddle-legacy";
}

export function resolveOcrEngineDisplayName(
  pipeline: OcrPipeline | null | undefined,
): string {
  return OCR_ENGINE_PROFILES[resolveOcrPipeline(pipeline)].displayName;
}

export function resolveOcrBboxProvider(
  pipeline: OcrPipeline | null | undefined,
): "hayai-regions" | "paddleocr" | "hunyuan-regions" {
  return OCR_ENGINE_PROFILES[resolveOcrPipeline(pipeline)].bboxProvider;
}

export function resolveOcrRendererKeyPrefix(
  pipeline: OcrPipeline | null | undefined,
): "hayaiOcr" | "ocr" | "hunyuanOcr" {
  return OCR_ENGINE_PROFILES[resolveOcrPipeline(pipeline)].rendererKeyPrefix;
}
