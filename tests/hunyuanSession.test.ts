import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import type { TranslationOptions } from "../src/main/appSettings";
import { startHunyuanRecognitionSession } from "../src/main/pipeline/hunyuanRecognitionSession";

// Electron is the native image codec boundary. Region parsing, order,
// geometry, padding, aggregation and session lifecycle remain production code.
vi.mock("electron", () => ({
  nativeImage: {
    createFromBuffer: (bytes: Buffer) => {
      const image = PNG.sync.read(bytes);
      return {
        getSize: () => ({ width: image.width, height: image.height }),
        isEmpty: () => false,
        crop: ({
          x,
          y,
          width,
          height,
        }: {
          x: number;
          y: number;
          width: number;
          height: number;
        }) => {
          const cropped = new PNG({ width, height });
          PNG.bitblt(image, cropped, x, y, width, height, 0, 0);
          return { toPNG: () => PNG.sync.write(cropped) };
        },
      };
    },
  },
}));
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "hunyuan-session-"));
  dirs.push(root);
  const imagePath = join(root, "image.png"),
    ocrBboxRegionsPath = join(root, "regions.json");
  await writeFile(
    imagePath,
    PNG.sync.write(new PNG({ width: 100, height: 100 })),
  );
  await writeFile(
    ocrBboxRegionsPath,
    JSON.stringify({
      schemaVersion: "hayai-dialogue-effect-separated-v1",
      width: 100,
      height: 100,
      dialogueRegions: [1, 2].map((id) => ({
        id,
        regionId: `R${id}`,
        kind: "dialogue",
        bbox: [id * 10, 10, id * 10 + 8, 20],
        detectorConfidence: 0.9,
        sourceDetectionIds: [`T${id}`],
      })),
      effectRegions: [],
    }),
  );
  const execution = { device: "gpu", backend: "cuda", model: "f16" } as const;
  const input: Partial<TranslationOptions> = {
    ocrPipeline: "hunyuan",
    ocrDevice: "gpu",
    outputDir: root,
    workingDir: root,
    imagePath,
    ocrBboxRegionsPath,
    hunyuanOcr: execution,
    onProgress: vi.fn(),
  };
  const options = input as TranslationOptions;
  const dispose = vi.fn(async () => {});
  const native = {
    assets: vi.fn(async () => ({ modelPath: "text", projectorPath: "vision" })),
    runtime: vi.fn(async () => "server"),
    start: vi.fn(async () => ({
      dispose,
      assertAlive: vi.fn(),
      baseUrl: "http://127.0.0.1:1",
      headers: {},
    })),
    request: vi.fn(async () => "text"),
  };
  return {
    options,
    native,
    dispose,
    session: startHunyuanRecognitionSession(options, native),
  };
}

it("reuses one server across regions/pages and closes it at the workload boundary", async () => {
  const { options, session, native, dispose } = await setup();
  const result = await session.collect(options);
  await session.collect(options);
  await session.dispose();
  expect(native.start).toHaveBeenCalledOnce();
  expect(native.request).toHaveBeenCalledTimes(4);
  expect(dispose).toHaveBeenCalledOnce();
  expect(result.hints).toMatchObject([
    { id: 1, x1: 10, x2: 18, geometryLocked: true },
    { id: 2, x1: 20, x2: 28, geometryLocked: true },
  ]);
});

it("retries a GPU region once on the same CPU model without persisting or duplicating output", async () => {
  const { options, session, native, dispose } = await setup();
  native.request.mockRejectedValueOnce(new Error("CUDA error: out of memory"));
  const result = await session.collect(options);
  await session.dispose();
  expect(result.hints).toHaveLength(2);
  expect(native.request).toHaveBeenCalledTimes(3);
  expect(native.start.mock.calls[1]).toBeDefined();
  expect(result.hints).toMatchObject([
    { executions: [{ model: "f16", device: "cpu", backend: "cpu" }] },
    { executions: [{ device: "cpu" }] },
  ]);
  expect(options.hunyuanOcr?.device).toBe("gpu");
  expect(dispose).toHaveBeenCalledTimes(2);
});

it.each([
  "SHA-256 mismatch",
  "download failed",
  "invalid input",
  "server exited 0xC0000005",
])("does not hide %s with CPU fallback", async (message) => {
  const { options, session, native, dispose } = await setup();
  native.request.mockRejectedValue(new Error(message));
  await expect(session.collect(options)).rejects.toThrow(message);
  expect(native.start).toHaveBeenCalledOnce();
  expect(dispose).toHaveBeenCalledOnce();
});

it("ends on CPU failure after one GPU retry", async () => {
  const { options, session, native, dispose } = await setup();
  native.request.mockRejectedValue(new Error("CUDA error: out of memory"));
  await expect(session.collect(options)).rejects.toThrow("out of memory");
  expect(native.start).toHaveBeenCalledTimes(2);
  expect(dispose).toHaveBeenCalledTimes(2);
});

it("does not classify download failures as GPU errors even when their text mentions CUDA", async () => {
  const { options, session, native } = await setup();
  native.assets.mockRejectedValue(
    new Error("CUDA error archive download failed"),
  );
  await expect(session.collect(options)).rejects.toThrow("download failed");
  expect(native.assets).toHaveBeenCalledOnce();
  expect(native.start).not.toHaveBeenCalled();
});

it("does not start a server after cancellation or malformed region input", async () => {
  const { options, session, native } = await setup();
  await expect(
    session.collect({ ...options, abortSignal: AbortSignal.abort() }),
  ).rejects.toThrow();
  expect(native.start).not.toHaveBeenCalled();
});

it("preserves selected geometry, segment order and separate effects through a mid-region retry", async () => {
  const { options, session, native } = await setup();
  const manifest = JSON.parse(
    await readFile(options.ocrBboxRegionsPath ?? "", "utf8"),
  );
  manifest.dialogueRegions[0].recognitionBboxes = [
    [14, 10, 18, 20],
    [10, 10, 14, 20],
  ];
  manifest.effectRegions = [
    { ...manifest.dialogueRegions[1], id: 3, regionId: "E3", kind: "effect" },
  ];
  await writeFile(options.ocrBboxRegionsPath ?? "", JSON.stringify(manifest));
  native.request
    .mockResolvedValueOnce("right")
    .mockRejectedValueOnce(new Error("CUDA error: out of memory"))
    .mockResolvedValueOnce("left")
    .mockResolvedValueOnce("dialogue")
    .mockResolvedValueOnce("effect");
  const result = await session.collect(options);
  await session.dispose();
  expect(result.hints).toMatchObject([
    {
      id: 1,
      x1: 10,
      x2: 18,
      ocrText: "rightleft",
      recognitionSegments: [
        { x1: 14, x2: 18, ocrText: "right" },
        { x1: 10, x2: 14, ocrText: "left" },
      ],
      executions: [{ backend: "cuda" }, { backend: "cpu" }],
    },
    { id: 2, ocrText: "dialogue" },
  ]);
  expect(result.effectReviewRegions).toMatchObject([
    { id: "E3", recognizedText: "effect" },
  ]);
  expect(native.request).toHaveBeenCalledTimes(5);
});

it.each(["coordinates", "identity", "dimensions"])(
  "rejects malformed %s before native loading",
  async (kind) => {
    const { options, session, native } = await setup();
    const manifest = JSON.parse(
      await readFile(options.ocrBboxRegionsPath ?? "", "utf8"),
    );
    if (kind === "coordinates")
      manifest.dialogueRegions[0].bbox = [-1, 0, 1, 1];
    if (kind === "identity") manifest.dialogueRegions[1].regionId = "R1";
    if (kind === "dimensions") manifest.width = 101;
    await writeFile(options.ocrBboxRegionsPath ?? "", JSON.stringify(manifest));
    await expect(session.collect(options)).rejects.toThrow();
    expect(native.assets).not.toHaveBeenCalled();
  },
);

it.each(["AbortError", "TimeoutError"])(
  "disposes a running server on %s without a CPU retry",
  async (name) => {
    const { options, session, native, dispose } = await setup();
    native.request.mockRejectedValueOnce(new DOMException("interrupted", name));
    await expect(session.collect(options)).rejects.toThrow("interrupted");
    expect(dispose).toHaveBeenCalledOnce();
    expect(native.start).toHaveBeenCalledOnce();
    await expect(session.collect(options)).rejects.toThrow("closed");
  },
);

it("does not return partial page results after a later region fails", async () => {
  const { options, session, native, dispose } = await setup();
  native.request
    .mockResolvedValueOnce("first")
    .mockRejectedValueOnce(new Error("server exited"));
  await expect(session.collect(options)).rejects.toThrow("server exited");
  expect(dispose).toHaveBeenCalledOnce();
  expect(native.start).toHaveBeenCalledOnce();
});
