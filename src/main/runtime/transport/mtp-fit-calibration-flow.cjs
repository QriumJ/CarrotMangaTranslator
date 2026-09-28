// @ts-check
/** @typedef {import("../runtime-jsdoc-types").RuntimeOptions & { onProgress?: ((progress: Record<string, unknown>) => void) | null } & Record<string, any>} CalibrationOptions */
/** @typedef {{ isMemoryEstimateMissing: () => boolean; restart: (fitTargetMiB: number) => Promise<void> }} FitRecovery */
const {
  measureNvidiaFreeVramMiB,
  probeMtpServerPerformance,
  shouldCalibrateMtpFit,
} = require("../model/mtp-fit-calibration.cjs");

const { prepareMtpFitCache } = require("./mtp-fit-cache.cjs");

const VRAM_THROTTLE_MESSAGE =
  "Gemma가 VRAM 부족으로 너무 느려 작업을 중단했습니다. 설정에서 컨텍스트 길이와 최대 출력 토큰을 낮춰 주세요.";
const PROBE_FAILURE_MESSAGE =
  "Gemma 시작 전 성능 검사를 통과하지 못했습니다. 모델 실행 로그를 확인해 주세요.";

const DEFAULT_CALIBRATION_DEPENDENCIES = Object.freeze({
  measureNvidiaFreeVramMiB,
  probeMtpServerPerformance,
  shouldCalibrateMtpFit,
});

/**
 * Only persist a target after the normal startup performance probe succeeds.
 * A cache hit skips the known-bad initial allocation, never the health probe.
 * @template {{ effectiveFitTargetMb?: unknown }} T
 * @param {string} baseUrl
 * @param {string} serverPath
 * @param {CalibrationOptions} options
 * @param {(baseUrl: string, serverPath: string, options: CalibrationOptions) => Promise<T>} start
 */
async function withMtpFitCache(baseUrl, serverPath, options, start) {
  const cache = await prepareMtpFitCache(serverPath, options);
  const cached = cache.cached;
  const launchOptions = cached
    ? {
        ...options,
        fitTargetMb: cached.target,
        mtpFitRequestedTargetMiB: options.fitTargetMb,
      }
    : options;
  if (cached) {
    emitCalibrationProgress(
      options,
      "booting",
      "검증된 MTP 메모리 배분 재사용",
      "이전에 성공한 메모리 배분으로 모델을 준비합니다.",
      {
        progressMode: "log-only",
        installLogLine: `MTP fit 캐시 적용: ${options.fitTargetMb} → ${cached.target} MiB (시작 성능 검사는 유지).`,
      },
    );
  }
  try {
    const server = await start(baseUrl, serverPath, launchOptions);
    await cache.recordTarget(Number(server.effectiveFitTargetMb));
    return server;
  } catch (error) {
    if (cached && !options.abortSignal?.aborted) await cache.invalidate();
    throw error;
  }
}

/**
 * Compensate once for a confirmed missing MTP estimate using measured headroom.
 * Only an unhealthy, low-VRAM launch is retried. Saved settings, context, output
 * limits and MTP remain unchanged; successful corrections can be cached.
 *
 * @param {string} baseUrl
 * @param {CalibrationOptions} options
 * @param {typeof DEFAULT_CALIBRATION_DEPENDENCIES} [dependencies]
 * @param {FitRecovery} [recovery]
 */
async function calibrateMtpFitServer(
  baseUrl,
  options,
  dependencies = DEFAULT_CALIBRATION_DEPENDENCIES,
  recovery,
) {
  const requestedFitTargetMiB = Number(
    options.mtpFitRequestedTargetMiB ?? options.fitTargetMb ?? 0,
  );
  let effectiveFitTargetMiB = Number(options.fitTargetMb ?? 0);
  let inspection = await inspectMtpFitCalibration(
    baseUrl,
    options,
    requestedFitTargetMiB,
    dependencies,
  );
  const correctedTarget = resolveFitCorrection(options, inspection, recovery);
  if (correctedTarget !== null && recovery) {
    options.abortSignal?.throwIfAborted();
    effectiveFitTargetMiB = correctedTarget;
    emitFitCorrection(
      options,
      requestedFitTargetMiB,
      correctedTarget,
      inspection.observedFreeMiB,
    );
    await recovery.restart(correctedTarget);
    options.abortSignal?.throwIfAborted();
    inspection = await inspectMtpFitCalibration(
      baseUrl,
      { ...options, fitTargetMb: correctedTarget },
      requestedFitTargetMiB,
      dependencies,
    );
  }
  if (!inspection.probe.healthy) {
    throw emitVramThrottleError(options, {
      requestedFitTargetMiB,
      effectiveFitTargetMiB,
      observedFreeMiB: inspection.observedFreeMiB,
      predictedTokensPerSecond: inspection.probe.predictedPerSecond,
      probeTimedOut: inspection.probe.timedOut === true,
      mtpFitMemoryGapMiB: options.mtpFitMemoryGapMiB ?? null,
    });
  }
  return {
    requestedFitTargetMiB,
    effectiveFitTargetMiB,
    observedFreeMiB: inspection.observedFreeMiB,
  };
}

/** @param {CalibrationOptions} options @param {Awaited<ReturnType<typeof inspectMtpFitCalibration>>} inspection @param {FitRecovery | undefined} recovery */
function resolveFitCorrection(options, inspection, recovery) {
  const requested = inspection.requestedFitTargetMiB;
  const observed = inspection.observedFreeMiB;
  if (inspection.probe.healthy || !recovery?.isMemoryEstimateMissing())
    return null;
  if (
    !Number.isFinite(requested) ||
    requested <= 0 ||
    observed === null ||
    observed >= requested
  )
    return null;
  // Near saturation, free VRAM hides allocations paged out by Windows. Include
  // the pre-load CUDA/physical budget difference as well as the probe deficit.
  const budgetGap = Number.isFinite(options.mtpFitMemoryGapMiB)
    ? Math.max(0, options.mtpFitMemoryGapMiB)
    : 0;
  const extra = Math.min(
    4096,
    Math.max(512, Math.ceil((requested - observed + 256) / 256) * 256),
  );
  // The measured budget gap is unavailable physical memory, not an arbitrary
  // safety margin. Do not cap it together with the MTP deficit compensation.
  const corrected = Math.max(
    requested + extra + Math.ceil(budgetGap / 256) * 256,
    Number(options.fitTargetMb ?? requested) + 512,
  );
  if (options.gpuMemoryMb && corrected >= options.gpuMemoryMb) return null;
  return corrected;
}

/** @param {CalibrationOptions} options @param {number} requested @param {number} corrected @param {number | null} observed */
function emitFitCorrection(options, requested, corrected, observed) {
  emitCalibrationProgress(
    options,
    "booting",
    "MTP 메모리 배분 보정 중",
    "보조 모델의 누락된 메모리 여유를 반영해 번역 모델을 다시 준비합니다.",
    {
      progressMode: "indeterminate",
      installLogLine: `MTP 메모리 계산 누락과 성능 저하 확인: 여유 ${observed} MiB, CUDA/실제 VRAM 예산 차이 ${options.mtpFitMemoryGapMiB ?? "측정 불가"} MiB, fit ${requested} → ${corrected} MiB. 저장된 설정은 유지하며 한 번만 다시 검사합니다.`,
    },
  );
}

/**
 * @param {string} baseUrl
 * @param {CalibrationOptions} options
 * @param {number} requestedFitTargetMiB
 * @param {typeof DEFAULT_CALIBRATION_DEPENDENCIES} [dependencies]
 */
async function inspectMtpFitCalibration(
  baseUrl,
  options,
  requestedFitTargetMiB,
  dependencies = DEFAULT_CALIBRATION_DEPENDENCIES,
) {
  if (!dependencies.shouldCalibrateMtpFit(options)) {
    return disabledCalibration(requestedFitTargetMiB);
  }
  emitMtpFitMeasurement(options, requestedFitTargetMiB);
  const probe = await dependencies.probeMtpServerPerformance(baseUrl, options);
  const idleObservedFreeMiB =
    await dependencies.measureNvidiaFreeVramMiB(options);
  const observedFreeMiB = minimumFiniteNumber([
    probe.minimumFreeMiB,
    idleObservedFreeMiB,
  ]);
  return {
    requestedFitTargetMiB,
    observedFreeMiB,
    probe,
  };
}

/** @param {number} requestedFitTargetMiB */
function disabledCalibration(requestedFitTargetMiB) {
  return {
    requestedFitTargetMiB,
    observedFreeMiB: null,
    probe: {
      wallMs: 0,
      minimumFreeMiB: null,
      predictedTokens: null,
      predictedPerSecond: null,
      healthy: true,
      timedOut: false,
    },
  };
}

/** @param {CalibrationOptions} options @param {number} requestedFitTargetMiB */
function emitMtpFitMeasurement(options, requestedFitTargetMiB) {
  emitCalibrationProgress(
    options,
    "booting",
    "MTP VRAM 여유 측정 중",
    "실제 MTP 이미지 입력 중 남은 VRAM과 짧은 디코드 속도를 확인합니다.",
    {
      progressMode: "indeterminate",
      installLogLine: `MTP fit 실측을 시작합니다 (요청 ${requestedFitTargetMiB} MiB).`,
    },
  );
}

/** @param {CalibrationOptions} options @param {Record<string, unknown>} detail */
function emitVramThrottleError(options, detail) {
  const lowVram =
    typeof detail.observedFreeMiB === "number" &&
    detail.observedFreeMiB < Number(detail.requestedFitTargetMiB);
  const message = lowVram ? VRAM_THROTTLE_MESSAGE : PROBE_FAILURE_MESSAGE;
  emitCalibrationProgress(
    options,
    "booting",
    lowVram ? "Gemma VRAM 부족" : "Gemma 성능 검사 실패",
    message,
    {
      progressMode: "log-only",
      installLogLine: message,
      notification: { variant: "error", message },
    },
  );
  return createCalibrationError(message, detail);
}

/** @param {string} message @param {Record<string, unknown>} detail */
function createCalibrationError(message, detail) {
  return Object.assign(new Error(message), detail);
}

/** @param {CalibrationOptions} options @param {string} phase @param {string} progressText @param {string} detail @param {Record<string, unknown>} progress */
function emitCalibrationProgress(
  options,
  phase,
  progressText,
  detail,
  progress,
) {
  if (typeof options.onProgress !== "function") return;
  try {
    options.onProgress({ phase, progressText, detail, ...progress });
  } catch (_error) {
    // error-policy-allow: observer failures must never interrupt translation.
  }
}

/** @param {unknown[]} values */
function minimumFiniteNumber(values) {
  const finiteValues = values.filter(
    (value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
  return finiteValues.length ? Math.min(...finiteValues.map(Number)) : null;
}

module.exports = {
  VRAM_THROTTLE_MESSAGE,
  calibrateMtpFitServer,
  withMtpFitCache,
};
