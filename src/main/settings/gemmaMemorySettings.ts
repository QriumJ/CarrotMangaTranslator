import { DEFAULT_GEMMA_SAMPLING } from "../../shared/gemmaSamplingSettings";
import type {
  AppSettings,
  GemmaVramMode,
  ModelSource,
} from "../../shared/settingsTypes";
import {
  resolveBoolean,
  resolveNumberRange,
  resolveGemmaVramMode,
  resolveModelSource,
  resolveNullableIntegerRange,
  resolveOptionalString,
} from "./appSettingsResolvers";
import {
  resolveStoredGemmaMmproj,
  resolveStoredGemmaModel,
  resolveStoredLlamaRocmTarget,
  resolveStoredLlamaRuntimeProfile,
} from "./appSettingsStoredResolvers";
import { getModeAwareGemmaDefaults } from "./gemmaModelPresets";

type GemmaModelSettings = Pick<AppSettings["gemma"], "modelRepo" | "modelFile">;

export function normalizeGemmaSettings(
  gemma: Record<string, unknown> | null,
  defaults: AppSettings,
): AppSettings["gemma"] {
  const modelSource = resolveModelSource(
    gemma?.modelSource,
    defaults.gemma.modelSource,
  );
  const vramMode = resolveGemmaVramMode(
    gemma?.vramMode,
    defaults.gemma.vramMode,
  );
  const modeDefaults = resolveModeAwareDefaults(defaults, vramMode);
  const model = resolveStoredGemmaModel(gemma, modeDefaults, vramMode);
  return {
    modelSource,
    ...model,
    ...resolveGemmaMmprojSettings(gemma, model, modeDefaults, modelSource),
    ...resolveLocalModelPaths(gemma),
    vramMode,
    ...resolveGemmaMemoryTuning(gemma, defaults),
    ...resolveGemmaSampling(gemma, defaults),
    ...resolveGemmaRuntime(gemma, defaults),
    ...resolveUnsafeUnifiedMemorySetting(gemma, defaults),
  };
}

function resolveGemmaMmprojSettings(
  gemma: Record<string, unknown> | null,
  model: GemmaModelSettings,
  defaults: AppSettings,
  modelSource: ModelSource,
): Pick<AppSettings["gemma"], "mmprojRepo" | "mmprojFile"> {
  if (modelSource !== "huggingface") return {};
  return resolveStoredGemmaMmproj(gemma, model, defaults);
}

function resolveLocalModelPaths(
  gemma: Record<string, unknown> | null,
): Pick<AppSettings["gemma"], "localModelPath" | "localMmprojPath"> {
  const localModelPath = resolveOptionalString(gemma?.localModelPath);
  const localMmprojPath = resolveOptionalString(gemma?.localMmprojPath);
  return {
    ...(localModelPath ? { localModelPath } : {}),
    ...(localMmprojPath ? { localMmprojPath } : {}),
  };
}

function resolveGemmaMemoryTuning(
  gemma: Record<string, unknown> | null,
  defaults: AppSettings,
): Pick<AppSettings["gemma"], "fitTargetMb" | "mmprojOffload"> {
  const defaultFitTargetMb = defaults.gemma.fitTargetMb ?? 512;
  const fitTargetMb =
    resolveNullableIntegerRange(
      gemma?.fitTargetMb,
      defaultFitTargetMb,
      0,
      16384,
    ) ?? defaultFitTargetMb;
  return {
    fitTargetMb,
    mmprojOffload: resolveBoolean(
      gemma?.mmprojOffload,
      defaults.gemma.mmprojOffload ?? true,
    ),
  };
}

function resolveGemmaRuntime(
  gemma: Record<string, unknown> | null,
  defaults: AppSettings,
): Pick<AppSettings["gemma"], "llamaRuntimeProfile" | "llamaRocmTarget"> {
  const llamaRuntimeProfile = resolveStoredLlamaRuntimeProfile(gemma, defaults);
  const llamaRocmTarget = resolveStoredLlamaRocmTarget(
    gemma,
    defaults,
    llamaRuntimeProfile,
  );
  return {
    llamaRuntimeProfile,
    ...(llamaRocmTarget ? { llamaRocmTarget } : {}),
  };
}

function resolveModeAwareDefaults(
  defaults: AppSettings,
  vramMode: GemmaVramMode,
): AppSettings {
  return {
    ...defaults,
    gemma: {
      ...defaults.gemma,
      ...getModeAwareGemmaDefaults(defaults, vramMode),
    },
  };
}

function resolveUnsafeUnifiedMemorySetting(
  gemma: Record<string, unknown> | null,
  defaults: AppSettings,
): Pick<AppSettings["gemma"], "allowUnsafeUnifiedMemory"> {
  return resolveBoolean(
    gemma?.allowUnsafeUnifiedMemory,
    defaults.gemma.allowUnsafeUnifiedMemory ?? false,
  )
    ? { allowUnsafeUnifiedMemory: true }
    : {};
}

function resolveGemmaSampling(
  gemma: Record<string, unknown> | null,
  defaults: AppSettings,
): Pick<AppSettings["gemma"], "temperature" | "topP" | "topK"> {
  return {
    temperature: resolveNumberRange(
      gemma?.temperature,
      defaults.gemma.temperature ?? DEFAULT_GEMMA_SAMPLING.temperature,
      0,
      2,
    ),
    topP: resolveNumberRange(
      gemma?.topP,
      defaults.gemma.topP ?? DEFAULT_GEMMA_SAMPLING.topP,
      0.01,
      1,
    ),
    topK:
      resolveNullableIntegerRange(
        gemma?.topK,
        defaults.gemma.topK ?? DEFAULT_GEMMA_SAMPLING.topK,
        1,
        500,
      ) ?? DEFAULT_GEMMA_SAMPLING.topK,
  };
}
