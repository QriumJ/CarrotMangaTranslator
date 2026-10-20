// @ts-check
/** @typedef {{ ocrPipeline?: unknown }} OcrEngineOptions */

const HAYAI_OCR_PIPELINE = "hayai";
const PADDLE_LEGACY_OCR_PIPELINE = "paddle-legacy";
const MANAGED_OCR_BBOX_PROVIDERS = new Set([
  "hayai-regions",
  "paddleocr",
  "hunyuan-regions",
]);

const OCR_ENGINE_PROFILES = Object.freeze({
  hunyuan: Object.freeze({
    id: "hunyuan",
    displayName: "HunyuanOCR 1.5",
    provider: "hunyuan-regions",
  }),
  [HAYAI_OCR_PIPELINE]: Object.freeze({
    id: HAYAI_OCR_PIPELINE,
    displayName: "HayaiOCR",
    provider: "hayai-regions",
  }),
  [PADDLE_LEGACY_OCR_PIPELINE]: Object.freeze({
    id: PADDLE_LEGACY_OCR_PIPELINE,
    displayName: "PaddleOCR(레거시)",
    provider: "paddleocr",
  }),
});

/** @param {OcrEngineOptions} [options] @returns {"hayai" | "paddle-legacy" | "hunyuan" | null} */
function readConfiguredOcrEngineId(options = {}) {
  const value = String(options.ocrPipeline ?? "").trim();
  return value === HAYAI_OCR_PIPELINE ||
    value === PADDLE_LEGACY_OCR_PIPELINE ||
    value === "hunyuan"
    ? value
    : null;
}

/** @param {OcrEngineOptions} [options] @returns {"hayai" | "paddle-legacy" | "hunyuan"} */
function resolveOcrEngineId(options = {}) {
  return readConfiguredOcrEngineId(options) ?? PADDLE_LEGACY_OCR_PIPELINE;
}

/** @param {OcrEngineOptions} [options] */
function resolveOcrEngineProfile(options = {}) {
  return OCR_ENGINE_PROFILES[resolveOcrEngineId(options)];
}

/** @param {OcrEngineOptions} [options] @returns {boolean} */
function isHayaiOcrPipeline(options = {}) {
  return resolveOcrEngineId(options) === HAYAI_OCR_PIPELINE;
}

/** @param {OcrEngineOptions} [options] @param {string} [operation] @returns {void} */
function assertPaddleLegacyOcrPipeline(
  options = {},
  operation = "Paddle OCR operation",
) {
  if (resolveOcrEngineId(options) !== PADDLE_LEGACY_OCR_PIPELINE) {
    throw new TypeError(
      `${operation} is unavailable for the ${resolveOcrEngineLabel(options)} pipeline.`,
    );
  }
}

/** @param {OcrEngineOptions} [options] @returns {string} */
function resolveOcrEngineLabel(options = {}) {
  return resolveOcrEngineProfile(options).displayName;
}

/** @param {OcrEngineOptions} [options] @returns {string} */
function resolveOcrBboxProviderForEngine(options = {}) {
  return resolveOcrEngineProfile(options).provider;
}

/**
 * The selected pipeline owns its managed provider. Delivery-only providers
 * such as a JSON file or an external command remain valid, while a stale
 * Paddle/Hayai provider value cannot cross the engine boundary.
 *
 * @param {OcrEngineOptions} [options]
 * @param {unknown} [requestedProvider]
 * @returns {string}
 */
function resolveOcrBboxProviderForRequest(options = {}, requestedProvider) {
  const requested = normalizeOcrBboxProvider(requestedProvider);
  const hasManagedPipeline = readConfiguredOcrEngineId(options) !== null;
  if (requested && !MANAGED_OCR_BBOX_PROVIDERS.has(requested)) {
    return requested;
  }
  if (hasManagedPipeline) {
    return resolveOcrBboxProviderForEngine(options);
  }
  return requested || resolveOcrBboxProviderForEngine(options);
}

/** @param {unknown} provider @returns {string} */
function normalizeOcrBboxProvider(provider) {
  const normalized = String(provider ?? "").trim();
  return normalized === "paddleocr-vl" ? "paddleocr" : normalized;
}

/** @param {unknown} provider @returns {boolean} */
function isManagedOcrBboxProvider(provider) {
  return MANAGED_OCR_BBOX_PROVIDERS.has(normalizeOcrBboxProvider(provider));
}

/** @param {OcrEngineOptions} [options] */
function isRegionOcrPipeline(options = {}) {
  return (
    isHayaiOcrPipeline(options) || resolveOcrEngineId(options) === "hunyuan"
  );
}

module.exports = {
  isRegionOcrPipeline,
  HAYAI_OCR_PIPELINE,
  PADDLE_LEGACY_OCR_PIPELINE,
  assertPaddleLegacyOcrPipeline,
  isHayaiOcrPipeline,
  isManagedOcrBboxProvider,
  readConfiguredOcrEngineId,
  resolveOcrBboxProviderForEngine,
  resolveOcrBboxProviderForRequest,
  resolveOcrEngineId,
  resolveOcrEngineLabel,
};
