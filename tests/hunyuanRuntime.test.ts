import { expect, it, vi, afterEach } from "vitest";
import {
  hunyuanLaunchArgs,
  isHunyuanGpuFailure,
} from "../src/main/runtimeSupport/hunyuanLaunch";
import { hunyuanRuntimeKey } from "../src/main/runtimeSupport/hunyuanAssets";
import { recognizeHunyuanCrop } from "../src/main/runtimeSupport/hunyuanRequest";
import {
  buildOcrCacheConfiguration,
  matchesOcrCacheConfiguration,
} from "../src/main/pipeline/ocrHintsCacheConfiguration";
import type { TranslationOptions } from "../src/main/appSettings";

afterEach(() => vi.unstubAllGlobals());
const execution = { device: "gpu", backend: "cuda", model: "f16" } as const;
const base = {
  modelPath: "text.gguf",
  projectorPath: "vision.gguf",
  port: 1234,
  apiKey: "test",
};

it("bounds CPU parallelism and disables every GPU offload path", () => {
  const args = hunyuanLaunchArgs({
    ...base,
    execution: { ...execution, device: "cpu", backend: "cpu" },
    cpuCount: 32,
  });
  for (const flag of [
    "--no-mmproj-offload",
    "--no-op-offload",
    "--no-kv-offload",
  ])
    expect(args).toContain(flag);
  expect(args[args.indexOf("--device") + 1]).toBe("none");
  expect(args[args.indexOf("-ngl") + 1]).toBe("0");
  expect(args[args.indexOf("--threads") + 1]).toBe("16");
  expect(args[args.indexOf("-np") + 1]).toBe("1");
});

it.each(["cuda", "vulkan", "metal"] as const)(
  "uses bounded %s settings without speculative or quantized KV buffers",
  (backend) => {
    const args = hunyuanLaunchArgs({
      ...base,
      execution: { ...execution, backend },
      computeGpuIndex: 1,
    });
    expect(args[args.indexOf("-c") + 1]).toBe("4096");
    expect(args[args.indexOf("-b") + 1]).toBe("512");
    expect(args[args.indexOf("-ub") + 1]).toBe("512");
    expect(args[args.indexOf("--flash-attn") + 1]).toBe(
      backend === "cuda" ? "on" : "auto",
    );
    expect(args.join(" ")).not.toMatch(/draft|dflash|cache-type/);
    if (backend !== "metal")
      expect(args).toContain(backend === "cuda" ? "CUDA1" : "Vulkan1");
  },
);

it("selects standalone mainline assets on Windows and Metal on Apple including CPU", () => {
  expect(
    hunyuanRuntimeKey({ ...execution, device: "cpu", backend: "cpu" }, "win32"),
  ).toBe("SPEED_LLAMA_RUNTIME_CPU");
  expect(hunyuanRuntimeKey(execution, "win32", "cu129")).toBe(
    "SPEED_LLAMA_RUNTIME_CUDA13",
  );
  expect(hunyuanRuntimeKey({ ...execution, backend: "vulkan" }, "win32")).toBe(
    "SPEED_LLAMA_RUNTIME_VULKAN",
  );
  expect(
    hunyuanRuntimeKey(
      { ...execution, device: "cpu", backend: "cpu" },
      "darwin",
    ),
  ).toBe("SPEED_LLAMA_RUNTIME_METAL_ARM64");
});

it("only classifies accelerator failures as retryable", () => {
  for (const message of [
    "CUDA error: out of memory",
    "VK_ERROR_DEVICE_LOST",
    "failed to allocate Metal buffer",
    'error while handling argument "--device": invalid device: CUDA999',
  ])
    expect(isHunyuanGpuFailure(new Error(message))).toBe(true);
  for (const error of [
    new Error("SHA-256 mismatch"),
    new Error("download failed"),
    new RangeError("invalid coordinates"),
    new DOMException("CUDA error", "AbortError"),
    new Error("server exited -1073741819"),
    new Error("invalid device: unsupported-input"),
  ])
    expect(isHunyuanGpuFailure(error)).toBe(false);
});

it("retries length once with 1024 and never accepts truncated output", async () => {
  const fetch = vi.fn().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: "partial" }, finish_reason: "length" },
          ],
        }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  const server = {
    baseUrl: "http://127.0.0.1:1",
    headers: {},
    assertAlive: vi.fn(),
    dispose: vi.fn(),
  };
  await expect(
    recognizeHunyuanCrop(
      server,
      "data:image/png;base64,a",
      new AbortController().signal,
    ),
  ).rejects.toThrow("1,024");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(
    fetch.mock.calls.map((call) => JSON.parse(call[1].body).max_tokens),
  ).toEqual([384, 1024]);
});

it("separates actual CPU fallback, GPU execution, model and GPU selection caches", () => {
  const options = {
    ocrPipeline: "hunyuan",
    hunyuanOcr: execution,
  } as TranslationOptions;
  const cache = buildOcrCacheConfiguration(options);
  expect(matchesOcrCacheConfiguration(cache, options)).toBe(true);
  expect(
    matchesOcrCacheConfiguration(cache, {
      ...options,
      hunyuanOcr: { model: "f16", backend: "cuda", device: "gpu" },
    }),
  ).toBe(true);
  expect(
    matchesOcrCacheConfiguration(cache, {
      ...options,
      hunyuanOcr: { ...execution, model: "q4" },
    }),
  ).toBe(false);
  expect(
    matchesOcrCacheConfiguration(cache, { ...options, computeGpuIndex: 1 }),
  ).toBe(false);
  const fallback = buildOcrCacheConfiguration(options, {
    hints: [],
    diagnostics: [
      {
        provider: "hunyuan-regions",
        regions: [
          { executions: [{ ...execution, device: "cpu", backend: "cpu" }] },
        ],
      },
    ],
  });
  expect(matchesOcrCacheConfiguration(fallback, options)).toBe(false);
});

it.each([
  [400, "input exceeds context tokens", "영역을 나누어"],
  [503, "CUDA error: out of memory", "CUDA error"],
  [
    200,
    '{"choices":[{"message":{"content":"partial"},"finish_reason":"cancelled"}]}',
    "incomplete",
  ],
  [200, "{}", "invalid completion"],
])(
  "rejects failed or incomplete HTTP %s completions",
  async (status, body, message) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(body, { status })),
    );
    await expect(
      recognizeHunyuanCrop(
        {
          baseUrl: "http://127.0.0.1:1",
          headers: {},
          assertAlive() {},
          async dispose() {},
        },
        "data:image/png;base64,a",
        new AbortController().signal,
      ),
    ).rejects.toThrow(message);
  },
);

it("returns only the completed retry text after the initial output limit", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: "partial" }, finish_reason: "length" },
          ],
        }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: "complete" }, finish_reason: "stop" },
          ],
        }),
      ),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(
    recognizeHunyuanCrop(
      {
        baseUrl: "http://127.0.0.1:1",
        headers: {},
        assertAlive() {},
        async dispose() {},
      },
      "data:image/png;base64,a",
      new AbortController().signal,
    ),
  ).resolves.toBe("complete");
});
