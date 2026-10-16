import { app } from "electron";
import { homedir, release as osRelease } from "node:os";
import type { ErrorReportContext } from "../shared/errorReportTypes";
import type { AppSettings } from "../shared/settingsTypes";
import type { BuildChannel } from "../shared/runtimeCapabilities";
import type { AppPaths } from "./appPaths";
import { getLogPath, getPreviousLogPath } from "./logger";
import { detectBestGpuInfo, type DetectedGpuInfo } from "./gpuInfo";
import { getAppSettings } from "./settingsStore";
import { readPageWorkflowTimings } from "./pageWorkflow/pageWorkflowTimingStore";
import { resolveBuildChannel } from "./buildChannel";
import type { JobDiagnostics } from "./jobs/jobDiagnostics";
import type { PageWorkflowTiming } from "../shared/pageWorkflowTiming";

export type ErrorReportBuildEnvironment = {
  appPaths: AppPaths;
  appVersion: string;
  locale: string;
  isPackaged: boolean;
  platform: string;
  arch: string;
  osRelease: string;
  electronVersion: string;
  nodeVersion: string;
  settings: AppSettings | null;
  gpu: DetectedGpuInfo | null;
  currentLogPath: string;
  previousLogPath: string;
  homeDir?: string;
  buildChannel?: BuildChannel;
  executionDiagnostics?: unknown;
};

export async function collectErrorReportEnvironment(
  context: ErrorReportContext,
  appPaths: AppPaths,
  jobs?: ReturnType<JobDiagnostics["snapshot"]>,
  runtime = { getAppSettings, detectBestGpuInfo, readPageWorkflowTimings },
): Promise<ErrorReportBuildEnvironment> {
  const [settingsResult, gpuResult, timingResult] = await Promise.allSettled([
    diagnosticDeadline(runtime.getAppSettings(appPaths)),
    diagnosticDeadline(runtime.detectBestGpuInfo()),
    diagnosticDeadline(runtime.readPageWorkflowTimings(appPaths.dataRoot)),
  ]);
  return {
    appPaths,
    appVersion: app.getVersion(),
    locale: app.getLocale(),
    isPackaged: app.isPackaged,
    platform: process.platform,
    arch: process.arch,
    osRelease: osRelease(),
    electronVersion: process.versions.electron ?? "unknown",
    nodeVersion: process.versions.node,
    settings:
      settingsResult.status === "fulfilled" ? settingsResult.value : null,
    gpu: gpuResult.status === "fulfilled" ? gpuResult.value : null,
    currentLogPath: getLogPath(),
    previousLogPath: getPreviousLogPath(),
    homeDir: homedir(),
    buildChannel: resolveBuildChannel(),
    executionDiagnostics: {
      capturedAt: new Date().toISOString(),
      jobs:
        jobs
          ?.filter(
            (job) =>
              (!context.jobId || job.id === context.jobId) &&
              (!context.executionId || job.executionId === context.executionId),
          )
          .slice(0, 5) ?? [],
      timings:
        timingResult.status === "fulfilled"
          ? timingResult.value
              .filter(
                (record) =>
                  (!context.jobId || record.runId === context.jobId) &&
                  (!context.executionId ||
                    record.attemptId === context.executionId),
              )
              .slice(0, 3)
              .map(timingDiagnostics)
          : "unavailable",
      settingsCollection: settingsResult.status,
      gpuCollection: gpuResult.status,
    },
  };
}

function timingDiagnostics(record: PageWorkflowTiming) {
  const {
    runId,
    attemptId,
    status,
    startedAt,
    finishedAt,
    elapsedMs,
    stages,
    cleanupMs,
    activeStage,
    activePage,
    activeCleanup,
  } = record;
  return {
    runId,
    attemptId,
    status,
    startedAt,
    finishedAt,
    elapsedMs,
    stages,
    cleanupMs,
    activeStage,
    activePage,
    activeCleanup,
  };
}

async function diagnosticDeadline<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("Diagnostic collection timed out")),
          3000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function buildSystemMarkdown(
  environment: ErrorReportBuildEnvironment,
): string {
  const settings = environment.settings;
  const lines = [
    "## System information",
    "",
    `- App version: \`${environment.appVersion}\``,
    `- Build: \`${environment.isPackaged ? "packaged" : "development"}\``,
    `- Build channel: \`${environment.buildChannel ?? resolveBuildChannel(environment.platform, environment.arch)}\``,
    `- Electron: \`${environment.electronVersion}\``,
    `- Node.js: \`${environment.nodeVersion}\``,
    `- OS: \`${environment.platform} ${environment.osRelease} (${environment.arch})\``,
    `- Locale: \`${environment.locale}\``,
  ];

  if (environment.platform === "darwin" && environment.arch === "arm64") {
    lines.push(
      `- Apple chip: \`${environment.gpu?.name ?? "unknown"}\``,
      `- Unified memory: \`${unifiedMemoryDescription(environment.gpu) ?? "unknown"}\``,
      `- Metal device: \`${environment.gpu?.supportsMetal ? (environment.gpu.name ?? "available") : "unavailable"}\``,
    );
  }

  if (!settings) {
    lines.push("- App settings: unavailable");
    return lines.join("\n");
  }

  lines.push(...buildSettingsSystemLines(settings, environment.gpu));
  lines.push(
    "- Settings above were collected when preparing this report; execution settings are recorded separately.",
  );
  return lines.join("\n");
}

function buildSettingsSystemLines(
  settings: AppSettings,
  gpu: DetectedGpuInfo | null,
): string[] {
  const lines = [
    `- Model provider: \`${settings.modelProvider}\``,
    `- Model: \`${safeModelIdentifier(settings)}\``,
    `- Internet research Codex: \`${settings.internetResearch.codexModel} / ${settings.internetResearch.codexReasoningEffort}\``,
  ];
  if (settings.translation) {
    lines.push(
      `- Translation: \`${settings.translation.sourceLanguage} -> ${settings.translation.targetLanguage}\``,
    );
  }
  const ocrBackend = settings.ocr.gpuBackend
    ? ` / ${settings.ocr.gpuBackend}`
    : "";
  lines.push(
    `- OCR: \`${settings.ocr.device} / ${settings.ocr.qualityMode}${ocrBackend}\``,
  );
  if (settings.inpainting) {
    lines.push(`- Inpainting: \`${inpaintingDescription(settings)}\``);
  }
  lines.push(`- GPU: \`${gpuDescription(settings, gpu)}\``);
  return lines;
}

function inpaintingDescription(settings: AppSettings): string {
  return (
    [
      settings.inpainting?.model,
      settings.inpainting?.fluxBackend,
      settings.inpainting?.koharuBackend,
    ]
      .filter(Boolean)
      .join(" / ") || "default"
  );
}

function gpuDescription(
  settings: AppSettings,
  gpu: DetectedGpuInfo | null,
): string {
  const runtimeGpu = settings.runtimeHardware;
  return (
    [
      firstDefined(gpu?.vendor, runtimeGpu?.gpuVendor),
      firstDefined(gpu?.name, runtimeGpu?.gpuName),
      gpuMemoryDescription(gpu),
      firstDefined(gpu?.rocmTarget, runtimeGpu?.llamaRocmTarget),
    ]
      .filter(Boolean)
      .join(" / ") || "unknown"
  );
}

function firstDefined<T>(...values: Array<T | null | undefined>): T | null {
  return (
    values.find((value): value is T => value !== null && value !== undefined) ??
    null
  );
}

function gpuMemoryDescription(gpu: DetectedGpuInfo | null): string | null {
  return gpu?.memoryMb ? `${gpu.memoryMb} MiB` : null;
}

function unifiedMemoryDescription(gpu: DetectedGpuInfo | null): string | null {
  const memoryMb = gpu?.unifiedMemoryMb ?? gpu?.memoryMb;
  return memoryMb ? `${memoryMb} MiB` : null;
}

function safeModelIdentifier(settings: AppSettings): string {
  if (settings.modelProvider === "claude-code") {
    return `${settings.claude?.model ?? "default"} / ${settings.claude?.effort ?? "high"}`;
  }
  if (settings.modelProvider === "openai-codex") {
    return `${settings.codex.model} / ${settings.codex.reasoningEffort}`;
  }
  if (settings.modelProvider === "openai-api") {
    return settings.api.model;
  }
  if (settings.gemma.modelSource === "local") {
    return `local / ${settings.gemma.vramMode}${settings.gemma.llamaRuntimeProfile ? ` / ${settings.gemma.llamaRuntimeProfile}` : ""}`;
  }
  return `${settings.gemma.modelRepo}/${settings.gemma.modelFile} / ${settings.gemma.vramMode}${settings.gemma.llamaRuntimeProfile ? ` / ${settings.gemma.llamaRuntimeProfile}` : ""}`;
}
