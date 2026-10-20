import type { TranslationOptions } from "../appSettings";
import { resolveOcrPipeline } from "../../shared/ocrEngines";

const OCR_BATCH_PROFILE_KEYS = [
  "hunyuanOcr",
  "ocrPipeline",
  "ocrDevice",
  "ocrGpuBackend",
  "ocrGpuCudaTag",
  "ocrQualityMode",
  "ocrBboxProvider",
  "ocrBboxMode",
  "ocrEngine",
  "ocrEngineDtype",
  "ocrVersion",
  "ocrTextDetectionModelName",
  "ocrTextRecognitionModelName",
  "ocrMergeMode",
  "ocrDetLimit",
  "ocrRecBatch",
] as const satisfies ReadonlyArray<keyof TranslationOptions>;

export function assertUniformOcrBatchProfile(
  optionsList: TranslationOptions[],
): void {
  if (optionsList.length < 2) return;
  const expected = buildOcrBatchProfileKey(optionsList[0]);
  const mismatchIndex = optionsList.findIndex(
    (options) => buildOcrBatchProfileKey(options) !== expected,
  );
  if (mismatchIndex > 0) {
    throw new TypeError(
      `OCR batch item ${mismatchIndex + 1} has a different runtime profile. Split mixed engine/device profiles into separate batches.`,
    );
  }
}

function buildOcrBatchProfileKey(options: TranslationOptions): string {
  return JSON.stringify(
    OCR_BATCH_PROFILE_KEYS.map((key) =>
      key === "ocrPipeline"
        ? resolveOcrPipeline(options.ocrPipeline)
        : (options[key] ?? null),
    ),
  );
}
