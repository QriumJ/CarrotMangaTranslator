import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TranslationOptions } from "../appSettings";
import { loadAppRuntimeModule } from "../runtimeModuleLoader";
import {
  JsonLinesWorkerClient,
  type JsonLinesWorkerResponse,
} from "../runtimeSupport/jsonLinesWorkerClient";
import { logPipelineInfo, logPipelineWarning } from "./pipelineLogger";
import type { OcrBboxResult } from "./types";

type RuntimeLayout = { pythonPath?: string; runtimeDir?: string };
type OcrCommands = {
  buildOcrBboxCommand: (
    options: TranslationOptions,
    provider: string,
    output: string,
    runtime: RuntimeLayout,
  ) => { executable: string; args: string[] };
};
type WorkerResponse = JsonLinesWorkerResponse & { fatal?: boolean };
type HayaiWorker = JsonLinesWorkerClient<
  { image: string; regions: string; output: string },
  WorkerResponse
>;

export async function startHayaiRecognitionSession(
  options: TranslationOptions,
  normalize: (options: TranslationOptions) => Promise<OcrBboxResult>,
) {
  if (
    options.skipOcrBboxHints ||
    options.ocrBboxHints !== undefined ||
    options.ocrBboxResult !== undefined ||
    options.ocrBboxHintsPath
  )
    return { collect: normalize, dispose: () => Promise.resolve() };
  const simplePage = loadAppRuntimeModule("simplePage") as {
    ensureOcrRuntime: (options: TranslationOptions) => Promise<RuntimeLayout>;
  };
  const runtime = await simplePage.ensureOcrRuntime(options);
  options.abortSignal?.throwIfAborted();
  const commands = loadAppRuntimeModule("ocrCommands") as OcrCommands;
  const command = commands.buildOcrBboxCommand(
    options,
    "hayai-regions",
    join(options.outputDir, "ocr-bbox-hints.json"),
    runtime,
  );
  const environment = loadAppRuntimeModule("ocrEnvironment") as {
    buildOcrRuntimeEnv: (
      options: TranslationOptions,
      runtime: RuntimeLayout,
    ) => NodeJS.ProcessEnv;
  };
  // Custom OCR commands own their protocol and cannot become JSON workers.
  if (!command.args.some((arg) => /[/\\]hayai-bboxes\.py$/.test(arg)))
    return { collect: normalize, dispose: () => Promise.resolve() };
  const worker = createHayaiWorker(
    options,
    command,
    environment.buildOcrRuntimeEnv(options, runtime),
  );
  return {
    dispose: () => worker.dispose(),
    collect: (page: TranslationOptions) =>
      readHayaiWorkerPage(worker, page, normalize),
  };
}

function createHayaiWorker(
  options: TranslationOptions,
  command: { executable: string; args: string[] },
  env: NodeJS.ProcessEnv,
): HayaiWorker {
  const progress = loadAppRuntimeModule("ocrProgress") as {
    resolveOcrBboxTimeoutMs: (pages: number) => number;
  };
  const progressHandlers = loadAppRuntimeModule("ocrProgressHandlers") as {
    createOcrCommandProgressHandler: (
      options: TranslationOptions,
      config: { engineLabel: string },
    ) => (line: string) => void;
  };
  const shell = loadAppRuntimeModule("shellCommand") as {
    lowerProcessPriority: (
      pid: number | null,
      onOutput: (line: string) => void,
    ) => void;
  };
  const onOutput = progressHandlers.createOcrCommandProgressHandler(options, {
    engineLabel: "HayaiOCR",
  });
  return new JsonLinesWorkerClient<
    { image: string; regions: string; output: string },
    WorkerResponse
  >({
    executable: command.executable,
    args: [...command.args, "--worker"],
    env,
    workerName: "HayaiOCR",
    requestTimeoutMs: progress.resolveOcrBboxTimeoutMs(1),
    buildExitError: (code, stderr) =>
      Object.assign(new Error(`HayaiOCR 종료 (${code}): ${stderr}`), {
        nonRetriable: options.ocrDevice === "gpu",
      }),
    buildNotRunningError: (stderr) =>
      Object.assign(new Error(`HayaiOCR 실행 불가: ${stderr}`), {
        nonRetriable: options.ocrDevice === "gpu",
      }),
    sanitizeStderr: (text) => text,
    onStderr: (text) => {
      text.split(/[\r\n]+/).forEach(onOutput);
      logPipelineInfo("HayaiOCR", { detail: text.slice(-1600) });
    },
    onSpawn: (pid) => {
      if (options.ocrDevice === "cpu")
        shell.lowerProcessPriority(pid, onOutput);
    },
    onTerminationError: (error) =>
      logPipelineWarning("HayaiOCR cleanup failed", { error }),
  });
}

async function readHayaiWorkerPage(
  worker: HayaiWorker,
  page: TranslationOptions,
  normalize: (options: TranslationOptions) => Promise<OcrBboxResult>,
) {
  page.abortSignal?.throwIfAborted();
  if (!page.ocrBboxRegionsPath)
    throw new Error("HayaiOCR 고정 영역 입력이 필요합니다.");
  const output = join(page.outputDir, "ocr-bbox-hints.json");
  let result: WorkerResponse;
  try {
    const { response } = worker.startRequest(
      { image: page.imagePath, regions: page.ocrBboxRegionsPath, output },
      page.abortSignal,
    );
    result = await response;
  } catch (error) {
    if (page.ocrDevice === "gpu" && !page.abortSignal?.aborted)
      throw Object.assign(
        new Error("HayaiOCR GPU 실행 실패 — 작업을 중지합니다", {
          cause: error,
        }),
        { nonRetriable: true },
      );
    throw error;
  }
  if (!result.ok)
    throw Object.assign(new Error(result.error ?? "HayaiOCR 판독 실패"), {
      nonRetriable: result.fatal,
    });
  page.abortSignal?.throwIfAborted();
  const payload: unknown = JSON.parse(await readFile(output, "utf8"));
  const recognized = await normalize({ ...page, ocrBboxHints: payload });
  return {
    ...recognized,
    diagnostics: [
      {
        provider: "hayai-regions",
        outputPath: output,
        reusedRuntime: true,
      },
    ],
  };
}
