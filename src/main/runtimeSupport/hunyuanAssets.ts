import { existsSync } from "node:fs";
import { join } from "node:path";
import type { TranslationOptions } from "../appSettings";
import type { HunyuanExecution } from "../../shared/hunyuanOcr";
import { loadAppRuntimeModule } from "../runtimeModuleLoader";
import { ensureRemoteFile, hfResolveUrl } from "./modelDownloads";

export const HUNYUAN_REVISION = "9ddd3b47beb0de305ecd89a717748bac080d7aee";
export const HUNYUAN_RUNTIME_VERSION = "b11146";
const HUNYUAN_REPO = "prithivMLmods/HunyuanOCR-1.5-GGUF-Updated";
const HUNYUAN_FILES = {
  f16: {
    fileName: "HunyuanOCR.F16.gguf",
    bytes: 1083218528,
    sha256: "59eb3992dac3d34c168af3538d6d5792ee1451508b621e9788b04d78a675ef1f",
  },
  q4: {
    fileName: "HunyuanOCR.Q4_K_M.gguf",
    bytes: 354966656,
    sha256: "4148eadce41e41ccb694a947193c7ef58bc71e6e87a022c66bcf4195ce01f036",
  },
  vision: {
    fileName: "HunyuanOCR.mmproj-f16.gguf",
    bytes: 997235744,
    sha256: "2c9c459f68a9a3c221b1a8088d9c91ac1007ef22aa89045108d14d949f9a3994",
  },
} as const;

type RuntimeDescriptor = {
  dir: string;
  id: string;
  archives: Array<{
    archive: string;
    url: string;
    sha256: string;
    expectedBytes: number;
  }>;
};
type RuntimePaths = {
  resolveLlamaRuntimeSearchDirs: (options: TranslationOptions) => string[];
};

export function hunyuanRuntimeKey(
  execution: HunyuanExecution,
  platform: string,
  cudaTag?: string,
) {
  if (platform === "darwin") return "SPEED_LLAMA_RUNTIME_METAL_ARM64";
  if (execution.device === "cpu") return "SPEED_LLAMA_RUNTIME_CPU";
  if (execution.backend === "vulkan") return "SPEED_LLAMA_RUNTIME_VULKAN";
  return /^cu(129|13)/.test(cudaTag ?? "")
    ? "SPEED_LLAMA_RUNTIME_CUDA13"
    : "SPEED_LLAMA_RUNTIME_CUDA12";
}

export async function ensureHunyuanAssets(
  options: TranslationOptions,
  execution: HunyuanExecution,
) {
  const models = join(
    options.workingDir,
    "models",
    "hunyuan-ocr",
    HUNYUAN_REVISION,
  );
  const paths: string[] = [];
  for (const file of [HUNYUAN_FILES[execution.model], HUNYUAN_FILES.vision]) {
    paths.push(
      await ensureRemoteFile({
        modelDir: models,
        fileName: file.fileName,
        url: hfResolveUrl(HUNYUAN_REPO, file.fileName, HUNYUAN_REVISION),
        label: file.fileName,
        expectedSha256: file.sha256,
        minimumBytes: file.bytes,
        maximumBytes: file.bytes,
        expectedTotalBytes: file.bytes,
        signal: options.abortSignal,
        progressPhase: "ocr_preparing",
        onProgress: (progress) =>
          options.onProgress?.({ ...progress, phase: "ocr_preparing" }),
      }),
    );
  }
  return { modelPath: paths[0], projectorPath: paths[1] };
}

export async function ensureHunyuanRuntime(
  options: TranslationOptions,
  execution: HunyuanExecution,
): Promise<string> {
  const contracts = loadAppRuntimeModule("mainlineRuntimes") as Record<
    string,
    RuntimeDescriptor
  >;
  const runtime =
    contracts[
      hunyuanRuntimeKey(execution, process.platform, options.ocrGpuCudaTag)
    ];
  const runtimeOptions = {
    ...options,
    llamaRuntimePurpose: "hunyuan" as const,
    llamaRuntimeProfile:
      process.platform === "darwin" ? "metal" : execution.backend,
  };
  const downloader = loadAppRuntimeModule("llamaDownload") as {
    ensureDefaultLlamaRuntimeDownloaded: (
      options: TranslationOptions,
      runtime: RuntimeDescriptor,
    ) => Promise<void>;
  };
  await downloader.ensureDefaultLlamaRuntimeDownloaded(
    {
      ...runtimeOptions,
      onProgress: (progress) =>
        options.onProgress?.({
          ...progress,
          phase: "ocr_preparing",
          progressText: (progress.progressText ?? "").replace(
            /Gemma/g,
            "HunyuanOCR",
          ),
          installLogLine: progress.installLogLine?.replace(
            /Gemma/g,
            "HunyuanOCR",
          ),
        }),
    },
    runtime,
  );
  const paths = loadAppRuntimeModule("runtimePaths") as RuntimePaths;
  const binary =
    process.platform === "win32" ? "llama-server.exe" : "llama-server";
  const server = paths
    .resolveLlamaRuntimeSearchDirs(runtimeOptions)
    .map((root) => join(root, runtime.dir, binary))
    .find(existsSync);
  if (!server) throw new Error(`HunyuanOCR runtime missing: ${runtime.id}`);
  return server;
}
