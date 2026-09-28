import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { calibrateMtpFitServer } =
  require("../src/main/runtime/transport/mtp-fit-calibration-flow.cjs") as {
    calibrateMtpFitServer: (
      baseUrl: string,
      options: Record<string, unknown>,
      dependencies: CalibrationDependencies,
      recovery?: FitRecovery,
    ) => Promise<{
      effectiveFitTargetMiB: number;
      observedFreeMiB: number | null;
    }>;
  };

type FitRecovery = {
  isMemoryEstimateMissing: () => boolean;
  restart: (fitTargetMiB: number) => Promise<void>;
};

type Probe = {
  healthy: boolean;
  minimumFreeMiB: number | null;
  predictedPerSecond: number | null;
  timedOut?: boolean;
};

type CalibrationDependencies = {
  measureNvidiaFreeVramMiB: () => Promise<number | null>;
  probeMtpServerPerformance: () => Promise<Probe>;
  shouldCalibrateMtpFit: () => boolean;
};

function dependencies(probes: Probe[]): CalibrationDependencies {
  return {
    measureNvidiaFreeVramMiB: vi.fn().mockResolvedValue(900),
    probeMtpServerPerformance: vi
      .fn()
      .mockImplementation(async () => probes.shift() as Probe),
    shouldCalibrateMtpFit: vi.fn().mockReturnValue(true),
  };
}

describe("MTP fit calibration server flow", () => {
  it("checks a cached allocation once without treating its reserve as the user's requested free VRAM", async () => {
    const calibration = dependencies([
      { healthy: true, minimumFreeMiB: 1500, predictedPerSecond: 55 },
    ]);
    const restart = vi.fn();
    const result = await calibrateMtpFitServer(
      "http://localhost/v1",
      {
        fitTargetMb: 6144,
        mtpFitRequestedTargetMiB: 1024,
        mtpFitMemoryGapMiB: 4096,
      },
      calibration,
      { isMemoryEstimateMissing: () => true, restart },
    );
    expect(result.effectiveFitTargetMiB).toBe(6144);
    expect(restart).not.toHaveBeenCalled();
    expect(calibration.probeMtpServerPerformance).toHaveBeenCalledOnce();
  });

  it("recovers an unhealthy cached allocation once without adding the CUDA gap twice", async () => {
    const calibration = dependencies([
      { healthy: false, minimumFreeMiB: 100, predictedPerSecond: 2 },
      { healthy: true, minimumFreeMiB: 1600, predictedPerSecond: 50 },
    ]);
    const restart = vi.fn().mockResolvedValue(undefined);
    const result = await calibrateMtpFitServer(
      "http://localhost/v1",
      {
        fitTargetMb: 6144,
        mtpFitRequestedTargetMiB: 1024,
        mtpFitMemoryGapMiB: 4096,
      },
      calibration,
      { isMemoryEstimateMissing: () => true, restart },
    );
    expect(result.effectiveFitTargetMiB).toBe(6656);
    expect(restart).toHaveBeenCalledExactlyOnceWith(6656);
    expect(calibration.probeMtpServerPerformance).toHaveBeenCalledTimes(2);
  });

  it("keeps the configured free-VRAM target when the probe is healthy", async () => {
    const progress = vi.fn();
    const savedOptions = { fitTargetMb: 1024, onProgress: progress };
    const restart = vi.fn().mockResolvedValue(undefined);
    const calibration = dependencies([
      { healthy: true, minimumFreeMiB: 646, predictedPerSecond: 48.3 },
    ]);

    await calibrateMtpFitServer(
      "http://127.0.0.1:18180/v1",
      savedOptions,
      calibration,
    );

    expect(savedOptions.fitTargetMb).toBe(1024);
    expect(restart).not.toHaveBeenCalled();
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ progressText: "MTP VRAM 여유 측정 중" }),
    );
  });

  it("does nothing when calibration is disabled", async () => {
    const restart = vi.fn().mockResolvedValue(undefined);
    const calibration = dependencies([]);
    calibration.shouldCalibrateMtpFit = vi.fn().mockReturnValue(false);

    await calibrateMtpFitServer(
      "http://127.0.0.1:18180/v1",
      { fitTargetMb: 1153 },
      calibration,
    );

    expect(restart).not.toHaveBeenCalled();
    expect(calibration.probeMtpServerPerformance).not.toHaveBeenCalled();
  });

  it("stops immediately with an error toast when the probe times out", async () => {
    const progress = vi.fn();
    const restart = vi.fn().mockResolvedValue(undefined);
    const calibration = dependencies([
      {
        healthy: false,
        minimumFreeMiB: 900,
        predictedPerSecond: null,
        timedOut: true,
      },
      { healthy: true, minimumFreeMiB: 1200, predictedPerSecond: 20 },
    ]);

    await expect(
      calibrateMtpFitServer(
        "http://127.0.0.1:18180/v1",
        { fitTargetMb: 1024, onProgress: progress },
        calibration,
      ),
    ).rejects.toMatchObject({
      message:
        "Gemma가 VRAM 부족으로 너무 느려 작업을 중단했습니다. 설정에서 컨텍스트 길이와 최대 출력 토큰을 낮춰 주세요.",
      probeTimedOut: true,
    });

    expect(restart).not.toHaveBeenCalled();
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        notification: {
          variant: "error",
          message: expect.stringContaining(
            "컨텍스트 길이와 최대 출력 토큰을 낮춰 주세요",
          ),
        },
      }),
    );
  });

  it("does not keep restarting when decode speed is already unhealthy", async () => {
    const restart = vi.fn().mockResolvedValue(undefined);
    const calibration = dependencies(
      Array.from({ length: 7 }, (_value, index) => ({
        healthy: false,
        minimumFreeMiB: 1200,
        predictedPerSecond: 2 + index,
      })),
    );
    calibration.measureNvidiaFreeVramMiB = vi.fn().mockResolvedValue(1200);

    await expect(
      calibrateMtpFitServer(
        "http://127.0.0.1:18180/v1",
        { fitTargetMb: 1024 },
        calibration,
      ),
    ).rejects.toMatchObject({
      message:
        "Gemma 시작 전 성능 검사를 통과하지 못했습니다. 모델 실행 로그를 확인해 주세요.",
      effectiveFitTargetMiB: 1024,
      predictedTokensPerSecond: 2,
    });
    expect(restart).not.toHaveBeenCalled();
  });

  it("recovers issue 131's missing estimate and 135 MiB timeout with one measured refit", async () => {
    const options = Object.freeze({
      fitTargetMb: 1024,
      ctx: 30000,
      maxTokens: 20000,
      useDraft: true,
    });
    const calibration = dependencies([
      {
        healthy: false,
        minimumFreeMiB: 135,
        predictedPerSecond: null,
        timedOut: true,
      },
      { healthy: true, minimumFreeMiB: 1400, predictedPerSecond: 28 },
    ]);
    calibration.measureNvidiaFreeVramMiB = vi.fn().mockResolvedValue(1500);
    const restart = vi.fn().mockResolvedValue(undefined);
    const result = await calibrateMtpFitServer(
      "http://localhost/v1",
      options,
      calibration,
      {
        isMemoryEstimateMissing: () => true,
        restart,
      },
    );
    expect(restart).toHaveBeenCalledExactlyOnceWith(2304);
    expect(calibration.probeMtpServerPerformance).toHaveBeenCalledTimes(2);
    expect(calibration.probeMtpServerPerformance).toHaveBeenLastCalledWith(
      "http://localhost/v1",
      { ...options, fitTargetMb: 2304 },
    );
    expect(result).toMatchObject({
      effectiveFitTargetMiB: 2304,
      observedFreeMiB: 1400,
    });
    expect(options).toEqual({
      fitTargetMb: 1024,
      ctx: 30000,
      maxTokens: 20000,
      useDraft: true,
    });
  });

  it.each([
    { missing: false, free: 100, healthy: false },
    { missing: true, free: null, healthy: false },
    { missing: true, free: 1200, healthy: false },
    { missing: true, free: 100, healthy: true },
  ])(
    "does not refit without both a missing estimate and a measured low-VRAM performance failure: %j",
    async ({ missing, free, healthy }) => {
      const calibration = dependencies([
        {
          healthy,
          minimumFreeMiB: free,
          predictedPerSecond: healthy ? 30 : null,
        },
      ]);
      calibration.measureNvidiaFreeVramMiB = vi.fn().mockResolvedValue(free);
      const restart = vi.fn();
      const result = calibrateMtpFitServer(
        "http://localhost/v1",
        { fitTargetMb: 1024 },
        calibration,
        {
          isMemoryEstimateMissing: () => missing,
          restart,
        },
      );
      if (healthy)
        await expect(result).resolves.toMatchObject({
          effectiveFitTargetMiB: 1024,
        });
      else
        await expect(result).rejects.toMatchObject({ observedFreeMiB: free });
      expect(restart).not.toHaveBeenCalled();
    },
  );

  it("keeps a real VRAM sample when the idle sampler is unavailable", async () => {
    const calibration = dependencies([
      { healthy: true, minimumFreeMiB: 700, predictedPerSecond: 30 },
    ]);
    calibration.measureNvidiaFreeVramMiB = vi.fn().mockResolvedValue(null);
    await expect(
      calibrateMtpFitServer(
        "http://localhost/v1",
        { fitTargetMb: 1024 },
        calibration,
      ),
    ).resolves.toMatchObject({ observedFreeMiB: 700 });
  });

  it("includes the pre-load budget discrepancy that physical free memory hides under paging", async () => {
    const calibration = dependencies([
      {
        healthy: false,
        minimumFreeMiB: 135,
        predictedPerSecond: null,
        timedOut: true,
      },
      { healthy: true, minimumFreeMiB: 1500, predictedPerSecond: 35 },
    ]);
    const restart = vi.fn().mockResolvedValue(undefined);
    await calibrateMtpFitServer(
      "http://localhost/v1",
      { fitTargetMb: 1024, mtpFitMemoryGapMiB: 2300 },
      calibration,
      {
        isMemoryEstimateMissing: () => true,
        restart,
      },
    );
    expect(restart).toHaveBeenCalledExactlyOnceWith(4608);
  });

  it("accounts for unavailable physical VRAM even when the CUDA budget gap exceeds 4 GiB", async () => {
    const calibration = dependencies([
      {
        healthy: false,
        minimumFreeMiB: 444,
        predictedPerSecond: null,
        timedOut: true,
      },
      { healthy: true, minimumFreeMiB: 1400, predictedPerSecond: 35 },
    ]);
    const restart = vi.fn().mockResolvedValue(undefined);
    await calibrateMtpFitServer(
      "http://localhost/v1",
      { fitTargetMb: 1024, mtpFitMemoryGapMiB: 6979, gpuMemoryMb: 24564 },
      calibration,
      {
        isMemoryEstimateMissing: () => true,
        restart,
      },
    );
    expect(restart).toHaveBeenCalledExactlyOnceWith(9216);
  });

  it("stops after one correction when the second probe is still unhealthy", async () => {
    const calibration = dependencies([
      { healthy: false, minimumFreeMiB: 100, predictedPerSecond: 2 },
      { healthy: false, minimumFreeMiB: 200, predictedPerSecond: 3 },
    ]);
    const restart = vi.fn().mockResolvedValue(undefined);
    await expect(
      calibrateMtpFitServer(
        "http://localhost/v1",
        { fitTargetMb: 1024 },
        calibration,
        {
          isMemoryEstimateMissing: () => true,
          restart,
        },
      ),
    ).rejects.toMatchObject({
      effectiveFitTargetMiB: 2304,
      observedFreeMiB: 200,
    });
    expect(restart).toHaveBeenCalledOnce();
    expect(calibration.probeMtpServerPerformance).toHaveBeenCalledTimes(2);
  });

  it("propagates restart failure without another probe", async () => {
    const calibration = dependencies([
      { healthy: false, minimumFreeMiB: 100, predictedPerSecond: null },
    ]);
    const error = new Error("old server did not exit");
    await expect(
      calibrateMtpFitServer(
        "http://localhost/v1",
        { fitTargetMb: 1024 },
        calibration,
        {
          isMemoryEstimateMissing: () => true,
          restart: vi.fn().mockRejectedValue(error),
        },
      ),
    ).rejects.toBe(error);
    expect(calibration.probeMtpServerPerformance).toHaveBeenCalledOnce();
  });

  it("does not probe the replacement when cancelled during restart", async () => {
    const controller = new AbortController();
    const calibration = dependencies([
      { healthy: false, minimumFreeMiB: 100, predictedPerSecond: null },
    ]);
    await expect(
      calibrateMtpFitServer(
        "http://localhost/v1",
        { fitTargetMb: 1024, abortSignal: controller.signal },
        calibration,
        {
          isMemoryEstimateMissing: () => true,
          restart: async () => controller.abort(),
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calibration.probeMtpServerPerformance).toHaveBeenCalledOnce();
  });

  it.each([{ fitTargetMb: 0 }, { fitTargetMb: 1024, gpuMemoryMb: 2048 }])(
    "does not invent headroom or exceed the detected GPU capacity: %j",
    async (options) => {
      const calibration = dependencies([
        { healthy: false, minimumFreeMiB: 100, predictedPerSecond: 2 },
      ]);
      const restart = vi.fn();
      await expect(
        calibrateMtpFitServer("http://localhost/v1", options, calibration, {
          isMemoryEstimateMissing: () => true,
          restart,
        }),
      ).rejects.toBeInstanceOf(Error);
      expect(restart).not.toHaveBeenCalled();
    },
  );
});
