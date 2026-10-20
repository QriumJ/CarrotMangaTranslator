import { availableParallelism } from "node:os";
import type { HunyuanExecution } from "../../shared/hunyuanOcr";

export function hunyuanLaunchArgs(input: {
  execution: HunyuanExecution;
  modelPath: string;
  projectorPath: string;
  port: number;
  apiKey: string;
  computeGpuIndex?: number;
  cpuCount?: number;
}): string[] {
  const { execution } = input;
  const cpu = execution.device === "cpu";
  const args = [
    "-m",
    input.modelPath,
    "--mmproj",
    input.projectorPath,
    "--host",
    "127.0.0.1",
    "--port",
    String(input.port),
    "--api-key",
    input.apiKey,
    "-c",
    "4096",
    "-b",
    "512",
    "-ub",
    "512",
    "-np",
    "1",
    "--threads",
    String(Math.max(1, Math.min(16, input.cpuCount ?? availableParallelism()))),
    "--flash-attn",
    cpu ? "off" : execution.backend === "cuda" ? "on" : "auto",
    "--no-warmup",
    "--fit",
    "off",
    "--cache-ram",
    "0",
    "--no-cache-prompt",
    "--jinja",
  ];
  if (cpu) {
    args.push(
      "--device",
      "none",
      "-ngl",
      "0",
      "--no-mmproj-offload",
      "--no-kv-offload",
      "--no-op-offload",
    );
  } else {
    args.push("-ngl", "99");
    if (input.computeGpuIndex !== undefined && execution.backend !== "metal") {
      const prefix = execution.backend === "cuda" ? "CUDA" : "Vulkan";
      args.push("--device", `${prefix}${input.computeGpuIndex}`);
    }
  }
  return args;
}

/** Only actual accelerator initialization/allocation errors qualify. */
export function isHunyuanGpuFailure(error: unknown): boolean {
  if (
    !(error instanceof Error) ||
    error.name === "AbortError" ||
    error.name === "TimeoutError"
  )
    return false;
  return /out of (?:device )?memory|cuda(?: error|Malloc| initialization)|VK_ERROR_(?:OUT_OF_DEVICE_MEMORY|INITIALIZATION_FAILED|DEVICE_LOST)|failed to (?:initialize|init) (?:CUDA|Vulkan|Metal)|failed to allocate.*(?:CUDA|Vulkan|Metal|device)|no (?:CUDA|Vulkan|Metal|GPU) devices|invalid device: (?:CUDA|Vulkan|Metal)\d+|Hunyuan GPU unavailable/i.test(
    error.message,
  );
}
