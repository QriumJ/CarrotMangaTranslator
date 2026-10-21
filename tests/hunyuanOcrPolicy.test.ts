import { expect, it } from "vitest";
import {
  HUNYUAN_DEFAULTS,
  normalizeHunyuanSettings,
  recommendedOcrPipeline,
  resolveHunyuanExecution,
} from "../src/shared/hunyuanOcr";
import { OcrSettingsSchema } from "../src/shared/ipcOcrSettingsSchema";

it.each([
  [4095, "cpu", "f16"],
  [4096, "gpu", "f16"],
  [6143, "gpu", "f16"],
  [6144, "gpu", "f16"],
  [undefined, "cpu", "f16"],
] as const)("routes NVIDIA %s MiB to %s/%s", (gpuMemoryMb, device, model) => {
  expect(
    resolveHunyuanExecution(
      HUNYUAN_DEFAULTS,
      {
        gpuVendor: "nvidia",
        gpuMemoryMb,
      },
      16384,
      "win32",
    ),
  ).toEqual({ device, model, backend: device === "gpu" ? "cuda" : "cpu" });
});

it.each([
  [8191, "cpu", "f16"],
  [8192, "gpu", "f16"],
  [16383, "gpu", "f16"],
  [16384, "gpu", "f16"],
  [undefined, "cpu", "f16"],
] as const)(
  "routes Apple %s MiB to %s/%s",
  (unifiedMemoryMb, device, model) => {
    expect(
      resolveHunyuanExecution(
        HUNYUAN_DEFAULTS,
        {
          gpuVendor: "apple",
          supportsMetal: true,
          unifiedMemoryMb,
        },
        32768,
        "darwin",
      ),
    ).toEqual({ device, model, backend: device === "gpu" ? "metal" : "cpu" });
  },
);

it("preserves manual F16 on 4 GiB and chooses Vulkan for Windows AMD", () => {
  expect(
    resolveHunyuanExecution(
      { device: "gpu", model: "f16" },
      {
        gpuVendor: "amd",
        supportsVulkan: true,
        gpuMemoryMb: 4096,
      },
      8192,
      "win32",
    ),
  ).toEqual({ device: "gpu", model: "f16", backend: "vulkan" });
  expect(
    resolveHunyuanExecution(
      { device: "cpu", model: "auto" },
      {
        gpuVendor: "nvidia",
        gpuMemoryMb: 24576,
      },
      8192,
      "win32",
    ),
  ).toEqual({ device: "cpu", model: "f16", backend: "cpu" });
});

it("has no Q5 choice and preserves legacy OCR settings", () => {
  const legacy = {
    pipeline: "paddle-legacy",
    device: "gpu",
    qualityMode: "full",
    gpuBackend: "rocm-transformers",
  };
  expect(OcrSettingsSchema.parse(legacy)).toEqual(legacy);
  expect(
    OcrSettingsSchema.safeParse({
      ...legacy,
      hunyuan: { model: "q5", device: "auto" },
    }).success,
  ).toBe(false);
  expect(normalizeHunyuanSettings({ model: "q5" })).toEqual(HUNYUAN_DEFAULTS);
});

it.each([
  ["ja", "hayai"],
  ["ja-JP", "hayai"],
  ["zh", "hunyuan"],
  ["en", "hunyuan"],
  ["es", "hunyuan"],
  ["auto", null],
  [undefined, null],
] as const)(
  "recommends %s without mutating the selected pipeline",
  (language, expected) => {
    expect(recommendedOcrPipeline(language)).toBe(expected);
  },
);
