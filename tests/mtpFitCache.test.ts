import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GEMMA_12B_QAT_MODEL_REPO,
  GEMMA_12B_QAT_MODEL_FILE_Q4_K_M,
} from "../src/shared/modelPresets";

type Options = Record<string, unknown>;
const { withMtpFitCache } =
  require("../src/main/runtime/transport/mtp-fit-calibration-flow.cjs") as {
    withMtpFitCache: (
      url: string,
      binary: string,
      options: Options,
      start: (
        url: string,
        binary: string,
        options: Options,
      ) => Promise<{ effectiveFitTargetMb: number }>,
    ) => Promise<unknown>;
  };
const platform = Object.getOwnPropertyDescriptor(process, "platform");
let root: string;
let binary: string;
let options: Options;

beforeEach(async () => {
  Object.defineProperty(process, "platform", { value: "win32" });
  root = await mkdtemp(join(tmpdir(), "mtp-fit-cache-test-"));
  binary = join(root, "llama-server.exe");
  await writeFile(binary, "runtime");
  await writeFile(join(root, "ggml-cuda.dll"), "backend");
  const repo = join(
    root,
    "hub",
    `models--${GEMMA_12B_QAT_MODEL_REPO.replaceAll("/", "--")}`,
  );
  await mkdir(repo, { recursive: true });
  await writeFile(join(repo, GEMMA_12B_QAT_MODEL_FILE_Q4_K_M), "main weights");
  await writeFile(join(repo, "draft.gguf"), "draft weights");
  options = {
    modelRepo: GEMMA_12B_QAT_MODEL_REPO,
    modelFile: GEMMA_12B_QAT_MODEL_FILE_Q4_K_M,
    draftModelRepo: GEMMA_12B_QAT_MODEL_REPO,
    draftModelFile: "draft.gguf",
    hfHubCacheDir: join(root, "hub"),
    llamaCacheDir: join(root, "cache"),
    llamaRuntimeProfile: "cuda12",
    useDraft: true,
    draftSpecType: "draft-mtp",
    gpuLayers: "fit",
    fitTargetMb: 1024,
    ctx: 30000,
    maxTokens: 20000,
    batch: 1024,
    ubatch: 1024,
    cacheTypeK: "q4_0",
    cacheTypeV: "q4_0",
    port: 18180,
    textOnlyModel: true,
    mtpFitMemoryGapMiB: 4096,
    mtpFitPhysicalFreeMiB: 16000,
    mtpFitGpuTotalMiB: 24564,
    mtpFitGpuIdentity: "CUDA0: RTX 4090 (24564 MiB)",
  };
});

afterEach(async () => {
  if (platform) Object.defineProperty(process, "platform", platform);
  await rm(root, { recursive: true, force: true });
});

async function launch(overrides: Options = {}, target = 6144) {
  const start = vi.fn(
    async (_url: string, _binary: string, _options: Options) => ({
      effectiveFitTargetMb: target,
    }),
  );
  await withMtpFitCache(
    "http://localhost/v1",
    binary,
    { ...options, ...overrides },
    start,
  );
  return start.mock.calls;
}

async function cacheFile() {
  const directory = join(root, "cache", "mtp-fit-v1");
  return join(directory, (await readdir(directory))[0]);
}

describe("persistent MTP fit recovery", () => {
  it("reads a successful correction in a fresh process after an app restart", async () => {
    await launch();
    const modulePath =
      require.resolve("../src/main/runtime/transport/mtp-fit-calibration-flow.cjs");
    const script = `
      Object.defineProperty(process, 'platform', {value:'win32'});
      const {withMtpFitCache} = require(${JSON.stringify(modulePath)});
      withMtpFitCache('url', ${JSON.stringify(binary)}, ${JSON.stringify(options)},
        async (_url, _binary, options) => {
          process.stdout.write(String(options.fitTargetMb));
          return {effectiveFitTargetMb: options.fitTargetMb};
        }).catch(error => { console.error(error); process.exitCode = 1; });
    `;
    const { stdout } = await promisify(execFile)(
      process.execPath,
      ["-e", script],
      { timeout: 5000, windowsHide: true },
    );
    expect(stdout).toBe("6144");
  });

  it("starts a subsequent server at the successful target without changing saved settings", async () => {
    expect((await launch())[0][2].fitTargetMb).toBe(1024);
    const progress = vi.fn();
    const calls = await launch({
      port: 19000,
      onProgress: progress,
      mtpFitPhysicalFreeMiB: 15900,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0][2]).toMatchObject({
      fitTargetMb: 6144,
      mtpFitRequestedTargetMiB: 1024,
    });
    expect(options.fitTargetMb).toBe(1024);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        progressText: "검증된 MTP 메모리 배분 재사용",
      }),
    );
    expect(JSON.parse(await readFile(await cacheFile(), "utf8")).target).toBe(
      6144,
    );
  });

  it.each([-512, 512])(
    "tolerates ordinary WDDM budget fluctuations of %s MiB",
    async (delta) => {
      await launch();
      expect(
        (
          await launch({
            mtpFitPhysicalFreeMiB: 16000 + delta,
            mtpFitMemoryGapMiB: 4096 - delta,
          })
        )[0][2].fitTargetMb,
      ).toBe(6144);
    },
  );

  it.each([
    { ctx: 32000 },
    { maxTokens: 12000 },
    { cacheTypeK: "q8_0" },
    { batch: 512 },
    { ubatch: 256 },
    { draftMaxTokens: 2 },
    { fitTargetMb: 1536 },
    { mtpFitGpuIdentity: "CUDA0: RTX 5070 Ti (16303 MiB)" },
    { mtpFitPhysicalFreeMiB: 14000 },
    { mtpFitPhysicalFreeMiB: 18000 },
    { mtpFitPhysicalFreeMiB: 15487 },
    { mtpFitPhysicalFreeMiB: 16513 },
    { mtpFitMemoryGapMiB: 4609 },
    { mtpFitMemoryGapMiB: 5000 },
    { mtpFitPhysicalFreeMiB: null },
    { fitEnabled: false },
    { useDraft: false },
  ])(
    "does not reuse after relevant settings or memory change: %j",
    async (change) => {
      await launch();
      const calls = await launch(change);
      expect(calls[0][2].fitTargetMb).toBe(change.fitTargetMb ?? 1024);
      expect(calls[0][2].mtpFitRequestedTargetMiB).toBeUndefined();
    },
  );

  it.each(["llama-server.exe", "ggml-cuda.dll", "main", "draft"])(
    "detects same-path %s replacement",
    async (asset) => {
      await launch();
      const repo = join(
        root,
        "hub",
        `models--${GEMMA_12B_QAT_MODEL_REPO.replaceAll("/", "--")}`,
      );
      const file =
        asset === "main"
          ? join(repo, GEMMA_12B_QAT_MODEL_FILE_Q4_K_M)
          : asset === "draft"
            ? join(repo, "draft.gguf")
            : join(root, asset);
      await writeFile(file, "replacement bytes with a different size");
      expect((await launch())[0][2].fitTargetMb).toBe(1024);
    },
  );

  it.each([
    "{broken",
    "null",
    JSON.stringify({ target: 6144 }),
    JSON.stringify({
      target: 99999,
      free: 16000,
      gap: 4096,
      savedAt: Date.now(),
    }),
  ])("ignores corrupt or invalid entries: %s", async (contents) => {
    await launch();
    await writeFile(await cacheFile(), contents);
    expect((await launch())[0][2].fitTargetMb).toBe(1024);
  });

  it("expires old corrections instead of retaining stale allocations indefinitely", async () => {
    await launch();
    await writeFile(
      await cacheFile(),
      JSON.stringify({
        target: 6144,
        free: 16000,
        gap: 4096,
        savedAt: Date.now() - 15 * 86400000,
      }),
    );
    expect((await launch())[0][2].fitTargetMb).toBe(1024);
  });

  it("invalidates a failed cached launch and propagates the startup error", async () => {
    await launch();
    const error = new Error("probe failed");
    const start = vi.fn(async () => {
      throw error;
    });
    await expect(withMtpFitCache("url", binary, options, start)).rejects.toBe(
      error,
    );
    expect(start).toHaveBeenCalledOnce();
    expect((await launch())[0][2].fitTargetMb).toBe(1024);
  });

  it("does not discard successful history for user cancellation", async () => {
    await launch();
    const controller = new AbortController();
    await expect(
      withMtpFitCache(
        "url",
        binary,
        { ...options, abortSignal: controller.signal },
        async () => {
          controller.abort();
          throw new Error("cancelled");
        },
      ),
    ).rejects.toThrow("cancelled");
    expect((await launch())[0][2].fitTargetMb).toBe(6144);
  });

  it("does not persist uncorrected starts or failed attempts", async () => {
    await launch({}, 1024);
    await expect(
      readdir(join(root, "cache", "mtp-fit-v1")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      withMtpFitCache("url", binary, options, async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    expect((await launch())[0][2].fitTargetMb).toBe(1024);
  });

  it("keeps a healthy server usable when the cache cannot be written", async () => {
    await mkdir(join(root, "cache"), { recursive: true });
    await writeFile(join(root, "cache", "mtp-fit-v1"), "not a directory");
    expect((await launch())[0][2].fitTargetMb).toBe(1024);
  });
});
