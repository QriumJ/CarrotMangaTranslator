import { parentPort } from "node:worker_threads";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  normalizeSampledImage,
  requiresNativeSampledDecode,
} from "./sampledRetouchDecode";
import { dirname } from "node:path";
import { PNG } from "pngjs";
import {
  applyRetouchPatch,
  rasterSampledRetouch,
  updateRetouchDifferenceMask,
} from "./sampledRetouchRaster";
import type {
  SampledWorkerRequest,
  SampledWorkerReply,
} from "./sampledRetouchWorkerProtocol";

type Cache = {
  originalPath: string;
  currentPath: string;
  original: Buffer;
  current: Buffer;
  mask: Uint8Array;
  width: number;
  height: number;
};
let cache: Cache | null = null;

async function decode(
  path: string,
  task: SampledWorkerRequest,
): Promise<Buffer> {
  let bytes: Buffer = await readFile(path);
  if (requiresNativeSampledDecode(bytes)) {
    bytes = await normalizeSampledImage(path, task);
  }
  if (
    bytes.readUInt32BE(16) !== task.width ||
    bytes.readUInt32BE(20) !== task.height
  )
    throw new Error("복사 원본과 페이지 크기가 일치하지 않습니다.");
  return PNG.sync.read(bytes).data;
}

async function execute(
  task: SampledWorkerRequest,
): Promise<SampledWorkerReply> {
  const started = performance.now();
  const flag = new Int32Array(task.cancel);
  const check = () => {
    if (Atomics.load(flag, 0)) throw new Error("도장 작업을 취소했습니다.");
  };
  check();
  const { request } = task;
  if (
    !request.sampled ||
    request.geometry.kind !== "stroke" ||
    (request.mode !== "clone" && request.mode !== "heal")
  )
    throw new Error("도장 요청이 올바르지 않습니다.");
  if (
    request.geometry.points.some(
      ({ x, y }) =>
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        y < 0 ||
        x > task.width ||
        y > task.height,
    )
  )
    throw new Error("획의 좌표가 페이지 범위를 벗어났습니다.");
  cache = await loadCache(task, check);
  const patch = rasterSampledRetouch(
    cache.current,
    request.sampled.source === "original" ? cache.original : cache.current,
    task.width,
    task.height,
    request.geometry,
    request.sampled,
    request.mode,
    check,
  );
  let changed = false;
  for (let i = 0; i < patch.positions.length; i++) {
    const p = patch.positions[i] * 4;
    for (let c = 0; c < 4; c++)
      if (cache.current[p + c] !== patch.pixels[i * 4 + c]) changed = true;
  }
  if (!changed)
    return { ok: true, changed: false, elapsedMs: performance.now() - started };
  applyRetouchPatch(cache.current, patch);
  updateRetouchDifferenceMask(
    cache.original,
    cache.current,
    cache.mask,
    patch.positions,
  );
  check();
  await writeResult(task, cache);
  check();
  cache.currentPath = task.outputPath;
  return { ok: true, changed: true, elapsedMs: performance.now() - started };
}

parentPort?.on("message", (task: SampledWorkerRequest) => {
  void execute(task)
    .then((reply) => parentPort?.postMessage(reply))
    .catch((error: unknown) => {
      cache = null;
      parentPort?.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies SampledWorkerReply);
    });
});

async function loadCache(
  task: SampledWorkerRequest,
  check: () => void,
): Promise<Cache> {
  if (
    !cache ||
    cache.originalPath !== task.originalPath ||
    cache.currentPath !== task.currentPath ||
    cache.width !== task.width ||
    cache.height !== task.height
  ) {
    cache = null;
    const original = await decode(task.originalPath, task);
    check();
    const current =
      task.currentPath === task.originalPath
        ? Buffer.from(original)
        : await decode(task.currentPath, task);
    check();
    const mask = new Uint8Array(task.width * task.height);
    updateRetouchDifferenceMask(original, current, mask);
    cache = {
      originalPath: task.originalPath,
      currentPath: task.currentPath,
      original,
      current,
      mask,
      width: task.width,
      height: task.height,
    };
  }
  if (!cache) throw new Error("Image cache was not initialized.");
  return cache;
}

async function writeResult(
  task: SampledWorkerRequest,
  current: Cache,
): Promise<void> {
  await mkdir(dirname(task.outputPath), { recursive: true });
  await mkdir(dirname(task.maskPath), { recursive: true });
  await writeFile(
    task.outputPath,
    PNG.sync.write(
      Object.assign(new PNG(), {
        width: task.width,
        height: task.height,
        data: current.current,
      }),
      { deflateLevel: 3 },
    ),
    { flag: "wx" },
  );
  if (Atomics.load(new Int32Array(task.cancel), 0))
    throw new Error("도장 작업을 취소했습니다.");
  // Grayscale mask avoids another full RGBA page buffer.
  const maskData = Buffer.from(current.mask);
  for (let i = 0; i < maskData.length; i++) maskData[i] = maskData[i] ? 255 : 0;
  await writeFile(
    task.maskPath,
    PNG.sync.write(
      Object.assign(new PNG(), {
        width: task.width,
        height: task.height,
        data: maskData,
      }),
      {
        inputColorType: 0,
        inputHasAlpha: false,
        colorType: 0,
        deflateLevel: 3,
      },
    ),
    { flag: "wx" },
  );
}
