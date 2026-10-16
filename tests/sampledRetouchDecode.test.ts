import { beforeAll, afterAll, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { PNG } from "pngjs";
import ts from "typescript";
import {
  normalizeSampledImage,
  requiresNativeSampledDecode,
} from "../src/main/inpainting/sampledRetouchDecode";
import type { SampledWorkerRequest } from "../src/main/inpainting/sampledRetouchWorkerProtocol";

let directory: string;
let task: SampledWorkerRequest;
beforeAll(async () => {
  await mkdir(resolve(".tmp"), { recursive: true });
  directory = await mkdtemp(resolve(".tmp/stamp-native-test-"));
  const entry = await readFile(
    resolve("src/main/inpainting/sampledRetouchDecodeEntry.ts"),
    "utf8",
  );
  await writeFile(
    join(directory, "entry.js"),
    ts.transpileModule(entry, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
  );
  await writeFile(
    join(directory, "bootstrap.cjs"),
    'require("./entry.js").startSampledImageDecode(process.argv);',
  );
  task = {
    request: {
      chapterId: "chapter",
      pageId: "page",
      expectedRevision: "page-v1:revision",
      mode: "clone",
      geometry: { kind: "stroke", points: [{ x: 1, y: 1 }], radiusPx: 2 },
    },
    originalPath: "",
    currentPath: "",
    outputPath: "",
    maskPath: "",
    width: 3,
    height: 1,
    runtimeDir: resolve("src/main/runtime"),
    cancel: new SharedArrayBuffer(4),
    decoder: {
      executable: require("electron") as string,
      bootstrap: join(directory, "bootstrap.cjs"),
      packaged: false,
    },
  };
});
afterAll(async () => {
  if (directory?.startsWith(resolve(".tmp/stamp-native-test-")))
    await rm(directory, { recursive: true, force: true });
});
it("uses the existing native decoder in a separate process, including straight-alpha rounding", async () => {
  const source = join(directory, "input.png");
  await writeFile(
    source,
    PNG.sync.write(
      Object.assign(new PNG(), {
        width: 3,
        height: 1,
        data: Buffer.from([
          200, 100, 50, 128, 200, 100, 50, 0, 200, 100, 50, 255,
        ]),
      }),
    ),
  );
  const normalized = PNG.sync.read(await normalizeSampledImage(source, task));
  expect([...normalized.data]).toEqual([
    199, 100, 50, 128, 0, 0, 0, 0, 200, 100, 50, 255,
  ]);
}, 15000);
it("normalizes embedded PNG gamma instead of silently treating raw samples as sRGB", async () => {
  const plain = PNG.sync.write(
    Object.assign(new PNG(), {
      width: 1,
      height: 1,
      data: Buffer.from([128, 64, 32, 255]),
    }),
  );
  const gamma = PNG.sync.write(
    Object.assign(new PNG(), {
      width: 1,
      height: 1,
      gamma: 1,
      data: Buffer.from([128, 64, 32, 255]),
    }),
  );
  expect(requiresNativeSampledDecode(plain)).toBe(false);
  expect(requiresNativeSampledDecode(gamma)).toBe(true);
  expect(requiresNativeSampledDecode(Buffer.from("jpeg"))).toBe(true);
  const source = join(directory, "gamma.png");
  await writeFile(source, gamma);
  const normalized = PNG.sync.read(await normalizeSampledImage(source, task));
  expect(normalized.data[0]).toBeGreaterThan(170);
  expect(normalized.data[3]).toBe(255);
}, 15000);
it("cancels an isolated decoder before publishing and rejects missing input", async () => {
  const cancelled = { ...task, cancel: new SharedArrayBuffer(4) };
  Atomics.store(new Int32Array(cancelled.cancel), 0, 1);
  await expect(
    normalizeSampledImage(join(directory, "input.png"), cancelled),
  ).rejects.toThrow();
  await expect(
    normalizeSampledImage(join(directory, "missing.jpg"), task),
  ).rejects.toThrow();
}, 15000);
