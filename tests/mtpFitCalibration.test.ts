import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GEMMA_12B_MODEL_FILE_Q4_K_M,
  GEMMA_12B_MODEL_REPO,
  GEMMA_12B_QAT_MODEL_FILE_Q4_K_M,
  GEMMA_12B_QAT_MODEL_REPO,
} from "../src/shared/modelPresets";

const require = createRequire(import.meta.url);
const {
  createMtpCalibrationRequestBody,
  isLikelyMtpVramThrottle,
  probeMtpServerPerformance,
  measureMtpFitMemoryBudget,
  resolveMtpStartupTimeoutMs,
  shouldCalibrateMtpFit,
} = require("../src/main/runtime/model/mtp-fit-calibration.cjs") as {
  measureMtpFitMemoryBudget: (
    options: Record<string, unknown>,
    output: string,
    measure: (options: Record<string, unknown>) => Promise<number | null>,
    platform: NodeJS.Platform,
  ) => Promise<Record<string, unknown> | null>;
  shouldCalibrateMtpFit: (
    options: Record<string, unknown>,
    platform?: NodeJS.Platform,
  ) => boolean;
  createMtpCalibrationRequestBody: (options?: Record<string, unknown>) => {
    messages: Array<{ content: Array<{ type: string }> }>;
  };
  isLikelyMtpVramThrottle: (
    error: unknown,
    options: Record<string, unknown>,
    observedFreeMiB: number | null,
    platform?: NodeJS.Platform,
  ) => boolean;
  probeMtpServerPerformance: (
    baseUrl: string,
    options: Record<string, unknown>,
  ) => Promise<{
    healthy: boolean;
    predictedPerSecond: number | null;
    predictedTokens: number | null;
    timedOut: boolean;
  }>;
  resolveMtpStartupTimeoutMs: (
    options: Record<string, unknown>,
    defaultTimeoutMs: number,
    platform?: NodeJS.Platform,
  ) => number;
};

afterEach(() => vi.unstubAllGlobals());

describe("MTP fit calibration", () => {
  const memoryOptions = {
    modelRepo: GEMMA_12B_QAT_MODEL_REPO,
    modelFile: GEMMA_12B_QAT_MODEL_FILE_Q4_K_M,
    llamaRuntimeProfile: "cuda12",
    useDraft: true,
    draftSpecType: "draft-mtp",
    gpuLayers: "fit",
  };

  it("measures the selected GPU's pre-load CUDA/physical memory discrepancy", async () => {
    const measure = vi.fn().mockResolvedValue(13000);
    const output =
      "Available devices:\r\n  CUDA0: GPU A (8192 MiB, 8000 MiB free)\r\n  CUDA1: GPU B (24563 MiB, 17000 MiB free)\r\n";
    expect(
      await measureMtpFitMemoryBudget(
        { ...memoryOptions, computeGpuIndex: 1 },
        output,
        measure,
        "win32",
      ),
    ).toEqual({
      mtpFitMemoryGapMiB: 4000,
      mtpFitPhysicalFreeMiB: 13000,
      mtpFitGpuTotalMiB: 24563,
      mtpFitGpuIdentity: "CUDA1: GPU B (24563 MiB)",
    });
    expect(measure).toHaveBeenCalledExactlyOnceWith({
      ...memoryOptions,
      computeGpuIndex: 1,
    });
    measure.mockClear();
    expect(
      await measureMtpFitMemoryBudget(memoryOptions, output, measure, "win32"),
    ).toBeNull();
    expect(measure).not.toHaveBeenCalled();
  });

  it.each([null, -1, Number.NaN, 19000])(
    "does not inflate an unknown or smaller CUDA budget: %s",
    async (physical) => {
      const result = await measureMtpFitMemoryBudget(
        memoryOptions,
        "  CUDA0: RTX (24563 MiB, 17000 MiB free)\n",
        vi.fn().mockResolvedValue(physical),
        "win32",
      );
      expect(result?.mtpFitMemoryGapMiB ?? null).toBe(
        physical === 19000 ? 0 : null,
      );
    },
  );

  it.each(["no memory data", "CUDA0: RTX (16000 MiB, 17000 MiB free)"])(
    "skips untrustworthy preflight memory data: %s",
    async (output) => {
      const measure = vi.fn();
      expect(
        await measureMtpFitMemoryBudget(
          memoryOptions,
          output,
          measure,
          "win32",
        ),
      ).toBeNull();
      expect(measure).not.toHaveBeenCalled();
    },
  );

  it("adds no memory probe to full-offload or non-Windows routes", async () => {
    const measure = vi.fn();
    const output = "CUDA0: RTX (24563 MiB, 17000 MiB free)";
    expect(
      await measureMtpFitMemoryBudget(
        { ...memoryOptions, gpuLayers: "all" },
        output,
        measure,
        "win32",
      ),
    ).toBeNull();
    expect(
      await measureMtpFitMemoryBudget(memoryOptions, output, measure, "darwin"),
    ).toBeNull();
    expect(measure).not.toHaveBeenCalled();
  });

  it("only calibrates built-in QAT MTP speed models on Windows CUDA", () => {
    const speed = {
      modelRepo: GEMMA_12B_QAT_MODEL_REPO,
      modelFile: GEMMA_12B_QAT_MODEL_FILE_Q4_K_M,
      llamaRuntimeProfile: "cuda12",
      useDraft: true,
      draftSpecType: "draft-mtp",
      gpuLayers: "fit",
    };
    expect(shouldCalibrateMtpFit(speed, "win32")).toBe(true);
    expect(
      shouldCalibrateMtpFit({ ...speed, fitEnabled: false }, "win32"),
    ).toBe(false);
    expect(
      shouldCalibrateMtpFit(
        { ...speed, fitEnabled: false, gpuLayers: "all" },
        "win32",
      ),
    ).toBe(false);
    expect(
      shouldCalibrateMtpFit(
        { ...speed, llamaRuntimeProfile: "vulkan" },
        "win32",
      ),
    ).toBe(false);
    expect(shouldCalibrateMtpFit(speed, "darwin")).toBe(false);
    expect(
      shouldCalibrateMtpFit(
        {
          ...speed,
          modelRepo: GEMMA_12B_MODEL_REPO,
          modelFile: GEMMA_12B_MODEL_FILE_Q4_K_M,
        },
        "win32",
      ),
    ).toBe(false);
  });

  it("uses a text-only startup probe when the endpoint does not load vision", () => {
    const textOnly = createMtpCalibrationRequestBody({
      textOnlyModel: true,
    });
    const multimodal = createMtpCalibrationRequestBody();

    expect(textOnly.messages[0]?.content.map((part) => part.type)).toEqual([
      "text",
    ]);
    expect(multimodal.messages[0]?.content.map((part) => part.type)).toEqual([
      "image_url",
      "text",
    ]);
  });

  it("bounds only the risky Windows CUDA MTP startup and identifies low-VRAM timeouts", () => {
    const speed = {
      modelRepo: GEMMA_12B_QAT_MODEL_REPO,
      modelFile: GEMMA_12B_QAT_MODEL_FILE_Q4_K_M,
      llamaRuntimeProfile: "cuda12",
      useDraft: true,
      draftSpecType: "draft-mtp",
      gpuLayers: "fit",
      fitTargetMb: 1536,
    };

    expect(resolveMtpStartupTimeoutMs(speed, 1_800_000, "win32")).toBe(60_000);
    expect(
      resolveMtpStartupTimeoutMs(
        { ...speed, useDraft: false },
        1_800_000,
        "win32",
      ),
    ).toBe(1_800_000);
    const timeout = new Error(
      "Timed out while waiting for llama-server at http://127.0.0.1:18180/v1",
    );
    expect(isLikelyMtpVramThrottle(timeout, speed, 1200, "win32")).toBe(true);
    expect(isLikelyMtpVramThrottle(timeout, speed, 1600, "win32")).toBe(false);
    expect(
      isLikelyMtpVramThrottle(
        new Error("model file missing"),
        speed,
        100,
        "win32",
      ),
    ).toBe(false);
  });

  it("probes the configured full context without changing the saved limits", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            timings: { predicted_n: 32, predicted_per_second: 54.5 },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const result = await probeMtpServerPerformance(
      "http://127.0.0.1:18180/v1",
      {
        computeGpuIndex: null,
        textOnlyModel: true,
        ctx: 32_768,
        maxTokens: 32_768,
        fitTargetMb: 1536,
      },
    );

    expect(result).toMatchObject({
      healthy: true,
      predictedTokens: 32,
      predictedPerSecond: 54.5,
      timedOut: false,
    });
    const request = JSON.parse(
      String(fetchImpl.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(request.max_tokens).toBe(32);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
