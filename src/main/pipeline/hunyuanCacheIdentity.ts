import type { TranslationOptions } from "../appSettings";
import type { OcrBboxResult } from "./types";
import type { HunyuanExecution } from "../../shared/hunyuanOcr";
import {
  HUNYUAN_REVISION,
  HUNYUAN_RUNTIME_VERSION,
} from "../runtimeSupport/hunyuanAssets";

export function hunyuanCacheIdentity(
  options: TranslationOptions,
  result?: OcrBboxResult,
): string | undefined {
  if (options.ocrPipeline !== "hunyuan") return undefined;
  const configured = options.hunyuanOcr ?? {
    model: "f16",
    device: "cpu",
    backend: "cpu",
  };
  const actual = (result?.diagnostics ?? []).flatMap((entry) => {
    const diagnostic = entry as {
      provider?: string;
      regions?: Array<{ executions?: HunyuanExecution[] }>;
    };
    return diagnostic?.provider === "hunyuan-regions"
      ? (diagnostic.regions ?? []).flatMap((region) => region.executions ?? [])
      : [];
  });
  const executions = actual.length ? actual : [configured];
  // A GPU job containing a CPU retry must not be replayed as a GPU cache hit.
  const unique = [
    ...new Set(
      executions.map(({ model, device, backend }) =>
        JSON.stringify({ model, device, backend }),
      ),
    ),
  ].sort();
  return JSON.stringify({
    revision: HUNYUAN_REVISION,
    runtime: HUNYUAN_RUNTIME_VERSION,
    computeGpuIndex: options.computeGpuIndex ?? null,
    executions: unique,
    context: 4096,
    batch: 512,
    padding: 16,
    tokens: [384, 1024],
  });
}
