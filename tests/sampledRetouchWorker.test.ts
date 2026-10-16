import { afterAll, beforeAll, expect, it } from "vitest";
import { Worker } from "node:worker_threads";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import ts from "typescript";
import { PNG } from "pngjs";
import type {
  SampledWorkerRequest,
  SampledWorkerReply,
} from "../src/main/inpainting/sampledRetouchWorkerProtocol";

let root: string;
let worker: Worker;
let originalPath: string;
beforeAll(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  root = await mkdtemp(resolve(".tmp/stamp-worker-test-"));
  for (const file of [
    "shared/sampledRetouch",
    "main/inpainting/sampledRetouchWorker",
    "main/inpainting/sampledRetouchRaster",
    "main/inpainting/retouchPoisson",
    "main/inpainting/sampledRetouchDecode",
    "main/runtimeModuleLoader",
  ]) {
    const source = await readFile(resolve(`src/${file}.ts`), "utf8");
    const output = join(root, `${file}.js`);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(
      output,
      ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    );
  }
  const pixels = Buffer.alloc(64 * 64 * 4, 255);
  for (let i = 0; i < 64 * 64; i++)
    pixels[i * 4] =
      pixels[i * 4 + 1] =
      pixels[i * 4 + 2] =
        i % 64 < 32 ? 40 : 200;
  originalPath = join(root, "original.png");
  await writeFile(
    originalPath,
    PNG.sync.write(
      Object.assign(new PNG(), { width: 64, height: 64, data: pixels }),
    ),
  );
  worker = new Worker(join(root, "main/inpainting/sampledRetouchWorker.js"));
});
afterAll(async () => {
  await worker?.terminate();
  if (root && root.startsWith(resolve(".tmp/stamp-worker-test-")))
    await rm(root, { recursive: true, force: true });
});
function task(name: string): SampledWorkerRequest {
  return {
    request: {
      chapterId: "chapter",
      pageId: "page",
      expectedRevision: "page-v1:revision",
      mode: "clone",
      requestId: name,
      sampled: {
        source: "current",
        offset: { x: -32, y: 0 },
        opacity: 1,
        hardness: 1,
      },
      geometry: { kind: "stroke", points: [{ x: 48, y: 32 }], radiusPx: 8 },
    },
    originalPath,
    currentPath: originalPath,
    outputPath: join(root, `${name}.png`),
    maskPath: join(root, `${name}-mask.png`),
    width: 64,
    height: 64,
    runtimeDir: resolve("src/main/runtime"),
    cancel: new SharedArrayBuffer(4),
  };
}
function run(request: SampledWorkerRequest): Promise<SampledWorkerReply> {
  return new Promise((resolveReply, reject) => {
    const done = (reply: SampledWorkerReply) => {
      worker.off("error", fail);
      resolveReply(reply);
    };
    const fail = (error: Error) => {
      worker.off("message", done);
      reject(error);
    };
    worker.once("message", done).once("error", fail).postMessage(request);
  });
}
it("writes pixels and exact difference mask, then reuses the current revision for 100 strokes", async () => {
  const first = task("first");
  expect(await run(first)).toMatchObject({ ok: true, changed: true });
  const result = PNG.sync.read(await readFile(first.outputPath));
  const mask = PNG.sync.read(await readFile(first.maskPath));
  expect(result.data[(32 * 64 + 48) * 4]).toBe(40);
  expect(mask.data[(32 * 64 + 48) * 4]).toBe(255);
  expect(mask.data[0]).toBe(0);
  let currentPath = first.outputPath;
  for (let i = 0; i < 100; i++) {
    const next = { ...task(`repeat-${i}`), currentPath };
    if (i % 2 === 0)
      next.request.sampled = {
        source: "original",
        offset: { x: 0, y: 0 },
        opacity: 1,
        hardness: 1,
      };
    expect(await run(next)).toMatchObject({ ok: true, changed: true });
    currentPath = next.outputPath;
  }
  const restored = task("restored");
  restored.currentPath = currentPath;
  restored.request.sampled = {
    source: "original",
    offset: { x: 0, y: 0 },
    opacity: 1,
    hardness: 1,
  };
  expect(await run(restored)).toMatchObject({ ok: true, changed: true });
  const restoredMask = PNG.sync.read(await readFile(restored.maskPath));
  expect(restoredMask.data[(32 * 64 + 48) * 4]).toBe(0);
}, 30000);
it("rejects cancellation without creating either artifact and recovers on the next page", async () => {
  const cancelled = task("cancel");
  Atomics.store(new Int32Array(cancelled.cancel), 0, 1);
  expect(await run(cancelled)).toMatchObject({ ok: false });
  await expect(readFile(cancelled.outputPath)).rejects.toMatchObject({
    code: "ENOENT",
  });
  await expect(readFile(cancelled.maskPath)).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect(await run(task("after-cancel"))).toMatchObject({
    ok: true,
    changed: true,
  });
});
it("rejects dimension mismatch and a failed artifact write without poisoning the cache", async () => {
  expect(await run({ ...task("wrong-size"), width: 128 })).toMatchObject({
    ok: false,
  });
  const failed = task("write-fail");
  await writeFile(failed.outputPath, "existing artifact");
  expect(await run(failed)).toMatchObject({ ok: false });
  expect(await readFile(failed.outputPath, "utf8")).toBe("existing artifact");
  expect(await run(task("after-failure"))).toMatchObject({
    ok: true,
    changed: true,
  });
});
