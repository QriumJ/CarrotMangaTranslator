import type { TranslationOptions } from "../appSettings";
import type { HunyuanExecution } from "../../shared/hunyuanOcr";
import {
  ensureHunyuanAssets,
  ensureHunyuanRuntime,
} from "../runtimeSupport/hunyuanAssets";
import { isHunyuanGpuFailure } from "../runtimeSupport/hunyuanLaunch";
import { recognizeHunyuanCrop } from "../runtimeSupport/hunyuanRequest";
import {
  startHunyuanServer,
  type HunyuanServer,
} from "../runtimeSupport/hunyuanServer";
import { readHunyuanRegions, recognizeHunyuanRegions } from "./hunyuanRegions";

const nativeDependencies = {
  assets: ensureHunyuanAssets,
  runtime: ensureHunyuanRuntime,
  start: startHunyuanServer,
  request: recognizeHunyuanCrop,
};
const CPU_F16: HunyuanExecution = {
  model: "f16",
  device: "cpu",
  backend: "cpu",
};

export function startHunyuanRecognitionSession(
  initial: TranslationOptions,
  native: typeof nativeDependencies = nativeDependencies,
) {
  let execution: HunyuanExecution = initial.hunyuanOcr ?? CPU_F16;
  let server: HunyuanServer | undefined;
  let closed = false;
  let busy = false;
  let canFallback = false;

  async function dispose() {
    closed = true;
    await server?.dispose();
    server = undefined;
  }
  async function ensureServer(options: TranslationOptions) {
    if (closed) throw new Error("HunyuanOCR session is closed.");
    options.abortSignal?.throwIfAborted();
    if (server) return server;
    // Download/verification failures are deliberately outside GPU fallback.
    canFallback = false;
    const assets = await native.assets(options, execution);
    const binary = await native.runtime(options, execution);
    canFallback = true;
    server = await native.start(options, execution, assets, binary);
    return server;
  }
  async function recognize(image: string, options: TranslationOptions) {
    const attempt = async () => {
      const current = await ensureServer(options);
      const signal = AbortSignal.any([
        AbortSignal.timeout(execution.device === "gpu" ? 60000 : 120000),
        ...(options.abortSignal ? [options.abortSignal] : []),
      ]);
      try {
        const text = await native.request(current, image, signal);
        return { text, execution: { ...execution } };
      } catch (error) {
        if (!signal.aborted) current.assertAlive();
        throw error;
      }
    };
    reportExecution(options, execution);
    try {
      return await attempt();
    } catch (error) {
      options.abortSignal?.throwIfAborted();
      if (
        !canFallback ||
        execution.device !== "gpu" ||
        !isHunyuanGpuFailure(error)
      )
        throw error;
      await server?.dispose();
      server = undefined;
      execution = { ...execution, device: "cpu", backend: "cpu" };
      reportExecution(options, execution, String(error));
      return attempt();
    }
  }
  return {
    async collect(options: TranslationOptions) {
      if (closed) throw new Error("HunyuanOCR session is closed.");
      if (busy) throw new Error("HunyuanOCR only accepts one page at a time.");
      busy = true;
      try {
        const source = await readHunyuanRegions(options);
        return await recognizeHunyuanRegions(source, (image) =>
          recognize(image, options),
        );
      } catch (error) {
        await dispose();
        throw error;
      } finally {
        busy = false;
      }
    },
    dispose,
  };
}

function reportExecution(
  options: TranslationOptions,
  execution: HunyuanExecution,
  reason?: string,
) {
  options.onProgress?.({
    phase: "ocr_running",
    progressText: `HunyuanOCR ${execution.model.toUpperCase()} · ${execution.backend.toUpperCase()}`,
    detail: reason
      ? `GPU 실행 실패로 같은 모델을 CPU에서 다시 실행합니다: ${reason}`
      : "고정 영역을 하나씩 판독합니다.",
    progressMode: "log-only",
  });
}

export async function collectHunyuanHints(options: TranslationOptions) {
  const session = startHunyuanRecognitionSession(options);
  try {
    return await session.collect(options);
  } finally {
    await session.dispose();
  }
}
