import { applyInpaintingRetouch } from "../inpainting";
import type { ImageDecodeFallback } from "./inpaintingTypes";
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import type { MangaPage } from "../../shared/libraryTypes";
import type { InpaintingRetouchRequest } from "../../shared/inpaintingTypes";
import { resolveInpaintedImagePath, resolveInpaintMaskPath } from "./imageIO";
import type { SampledWorkerReply } from "./sampledRetouchWorkerProtocol";

let worker: Worker | null = null;
let ownerId: number | null = null;
let active: { id: string; owner: number; flag: Int32Array } | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
const cancelled = new Set<string>();

export async function cancelSampledRetouch(
  owner: number,
  requestId: string | null,
): Promise<void> {
  if (requestId) {
    const key = `${owner}:${requestId}`;
    cancelled.add(key);
    if (cancelled.size > 64) {
      const oldest = cancelled.values().next().value;
      if (oldest) cancelled.delete(oldest);
    }
    if (active?.owner === owner && active.id === requestId)
      Atomics.store(active.flag, 0, 1);
  } else if (active?.owner === owner) {
    Atomics.store(active.flag, 0, 1);
  } else if (ownerId === owner) {
    await disposeWorker();
  }
}

async function disposeWorker(): Promise<void> {
  clearTimeout(idleTimer);
  const previous = worker;
  worker = null;
  ownerId = null;
  if (previous) await previous.terminate();
}

async function applySampledRetouch(
  page: MangaPage,
  request: InpaintingRetouchRequest,
  paths: { runtimeDir: string; isPackaged: boolean },
  owner: number,
): Promise<MangaPage> {
  assertSampledRequest(request);
  if (active) throw new Error("이전 도장 작업이 끝난 뒤 다시 시도해 주세요.");
  const key = `${owner}:${request.requestId}`;
  if (cancelled.delete(key)) throw new Error("도장 작업을 취소했습니다.");
  const flag = new Int32Array(new SharedArrayBuffer(4));
  active = { id: request.requestId, owner, flag };
  clearTimeout(idleTimer);
  const outputPath = resolveInpaintedImagePath(page.imagePath, request.mode);
  const maskPath = resolveInpaintMaskPath(page.imagePath, "retouch");
  try {
    if (worker && ownerId !== owner) await disposeWorker();
    worker ??= createWorker();
    ownerId = owner;
    const current = worker;
    const reply = await sendTask(current, flag, {
      request,
      originalPath: page.imagePath,
      currentPath: page.inpaintedImagePath ?? page.imagePath,
      outputPath,
      maskPath,
      runtimeDir: paths.runtimeDir,
      decoder: {
        executable: process.execPath,
        bootstrap: join(__dirname, "..", "bootstrap.js"),
        packaged: paths.isPackaged,
      },
      width: page.width,
      height: page.height,
      cancel: flag.buffer,
    });
    if (!reply.ok) throw new Error(reply.error);
    if (Atomics.load(flag, 0)) throw new Error("도장 작업을 취소했습니다.");
    if (!reply.changed) return page;
    return {
      ...page,
      inpaintedImagePath: outputPath,
      inpaintMaskPath: maskPath,
      maskProvenance: "retouch-updated",
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    await disposeWorker();
    await Promise.all([
      rm(outputPath, { force: true }),
      rm(maskPath, { force: true }),
    ]);
    throw error;
  } finally {
    active = null;
    cancelled.delete(key);
    idleTimer = setTimeout(() => {
      void disposeWorker();
    }, 30_000);
    idleTimer.unref();
  }
}

function sendTask(
  current: Worker,
  flag: Int32Array,
  task: import("./sampledRetouchWorkerProtocol").SampledWorkerRequest,
): Promise<SampledWorkerReply> {
  return new Promise<SampledWorkerReply>((resolve, reject) => {
    let abortGrace: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      clearTimeout(timeout);
      clearTimeout(abortGrace);
      current.off("message", onMessage);
      current.off("error", onError);
      current.off("exit", onExit);
    };
    const onMessage = (message: SampledWorkerReply) => {
      cleanup();
      resolve(message);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onExit = (code: number) =>
      onError(new Error(`도장 작업 스레드가 종료되었습니다 (${code}).`));
    const timeout = setTimeout(() => {
      Atomics.store(flag, 0, 1);
      abortGrace = setTimeout(
        () => onError(new Error("도장 처리 시간이 초과되었습니다.")),
        1000,
      );
    }, 120_000);
    current
      .once("message", onMessage)
      .once("error", onError)
      .once("exit", onExit);
    current.postMessage(task);
  });
}

function assertSampledRequest(
  request: InpaintingRetouchRequest,
): asserts request is InpaintingRetouchRequest & { requestId: string } {
  if (
    !request.requestId ||
    !request.sampled ||
    request.geometry.kind !== "stroke"
  )
    throw new Error("도장 설정이 누락되었습니다.");
}

function createWorker(): Worker {
  const created = new Worker(join(__dirname, "sampledRetouchWorker.js"));
  const invalidate = () => {
    if (worker === created) {
      worker = null;
      ownerId = null;
    }
  };
  created.on("exit", invalidate);
  created.on("error", invalidate);
  return created;
}

export async function applyRetouchRequestWithWorker(
  page: MangaPage,
  request: InpaintingRetouchRequest,
  paths: { runtimeDir: string; isPackaged: boolean },
  owner: number,
  decodeFallback?: ImageDecodeFallback,
): Promise<MangaPage> {
  if (request.mode === "clone" || request.mode === "heal")
    return applySampledRetouch(page, request, paths, owner);
  return applyInpaintingRetouch(page, {
    mode: request.mode,
    geometry: request.geometry,
    color: request.color,
    decodeFallback,
  });
}
