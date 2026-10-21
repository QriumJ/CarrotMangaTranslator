import { expect, it, vi } from "vitest";
import { resolveDefaultAppSettings } from "../src/main/appSettings";
import type { TranslationOptions } from "../src/main/appSettings";
import type { SimplePageRuntime } from "../src/main/simplePageRuntime";
import { normalizeAppSettings } from "../src/main/settings/appSettingsNormalize";
import { resolveOcrTranslationOptions } from "../src/main/settings/translationOcrOptions";
import { verifyOcrRuntime } from "../src/main/ipc/settingsModelTestProgress";

it.each(["hayai", "paddle-legacy", "hunyuan"] as const)(
  "preserves %s and explicit Hunyuan settings across storage normalization",
  (pipeline) => {
    const original = resolveDefaultAppSettings({});
    original.ocr = {
      ...original.ocr,
      pipeline,
      hunyuan: { model: "q4", device: "cpu" },
    };
    const result = normalizeAppSettings(
      original,
      resolveDefaultAppSettings({}),
    );
    expect(result.ocr.pipeline).toBe(pipeline);
    expect(result.ocr.hunyuan).toEqual({ model: "q4", device: "cpu" });
    expect(result.ocr.gpuBackend).toBe(original.ocr.gpuBackend);
  },
);

it("resolves Hunyuan independently of legacy GPU environment overrides", () => {
  const settings = resolveDefaultAppSettings({});
  settings.ocr = {
    ...settings.ocr,
    pipeline: "hunyuan",
    hunyuan: { model: "q4", device: "cpu" },
  };
  const options = resolveOcrTranslationOptions(
    {
      MANGA_TRANSLATOR_OCR_DEVICE: "gpu",
      MANGA_TRANSLATOR_PADDLEOCR_DEVICE: "gpu",
      MANGA_TRANSLATOR_OCR_GPU_BACKEND: "rocm-transformers",
    },
    settings,
    "minimum12b",
  );
  expect(options).toMatchObject({
    ocrPipeline: "hunyuan",
    ocrDevice: "cpu",
    ocrBboxProvider: "hunyuan-regions",
    hunyuanOcr: { model: "q4", device: "cpu", backend: "cpu" },
  });
  expect(options.ocrGpuBackend).toBeUndefined();
});

it.each([undefined, { model: "q4", device: "cpu", backend: "cpu" } as const])(
  "checks and disposes the native model from settings (%s)",
  async (hunyuanOcr) => {
    const input: Partial<TranslationOptions> = {
      ocrPipeline: "hunyuan",
      hunyuanOcr,
    };
    const dispose = vi.fn(async () => {});
    const native = {
      assets: vi.fn(async () => ({
        modelPath: "text",
        projectorPath: "vision",
      })),
      runtime: vi.fn(async () => "server"),
      start: vi.fn(async () => ({
        dispose,
        baseUrl: "http://127.0.0.1:1",
        headers: {},
        assertAlive() {},
      })),
    };
    const legacy: Partial<SimplePageRuntime> = { ensureOcrRuntime: vi.fn() };
    const progress = vi.fn();
    await verifyOcrRuntime(
      legacy as SimplePageRuntime,
      input as TranslationOptions,
      progress,
      undefined,
      native,
    );
    expect(legacy.ensureOcrRuntime).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenLastCalledWith(
      expect.objectContaining({ progressText: "HunyuanOCR 준비 완료" }),
    );
    expect(native.start).toHaveBeenCalledWith(
      expect.anything(),
      hunyuanOcr ?? { model: "f16", device: "cpu", backend: "cpu" },
      { modelPath: "text", projectorPath: "vision" },
      "server",
    );
  },
);
