import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import type { TranslationOptions } from "../src/main/appSettings";
import type { OcrBboxResult } from "../src/main/pipeline/types";
import { startHayaiRecognitionSession } from "../src/main/pipeline/hayaiRecognitionSession";

const boundary = vi.hoisted(() => ({
  prepare: vi.fn(),
  spawn: vi.fn(),
  script: "",
}));
// Only installation/model availability is substituted. Command construction,
// environment, JSON-lines transport, cancellation and normalization stay real.
vi.mock("../src/main/runtimeModuleLoader", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/main/runtimeModuleLoader")>();
  return {
    ...actual,
    loadAppRuntimeModule: (
      id: import("../src/main/runtimeModuleLoader").AppRuntimeModuleId,
    ) => {
      const module = actual.loadAppRuntimeModule(id);
      return id === "simplePage"
        ? { ...(module as object), ensureOcrRuntime: boundary.prepare }
        : module;
    },
  };
});
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (
      executable: string,
      args: string[],
      options: import("node:child_process").SpawnOptions,
    ) => {
      if (!args.includes("--worker"))
        return actual.spawn(executable, args, options);
      boundary.spawn(executable, args, options);
      return actual.spawn(process.execPath, ["-e", boundary.script], options);
    },
  };
});
const require = createRequire(import.meta.url);
const actualOcr =
  require("../src/main/runtime/simple-page-ocr-bbox-pipeline.cjs") as {
    collectOcrBboxHints: (
      options: TranslationOptions,
    ) => Promise<OcrBboxResult>;
  };
let root: string;
let options: TranslationOptions;
const sessions: Awaited<ReturnType<typeof startHayaiRecognitionSession>>[] = [];
const payload = {
  width: 100,
  height: 200,
  coordinateSpace: "pixels",
  items: [
    {
      id: 1,
      bbox: [10, 20, 50, 100],
      ocrText: "原文",
      recognitionSegments: [{ bbox: [10, 20, 50, 100], text: "原文" }],
    },
  ],
};
async function start(
  input = options,
  normalize = actualOcr.collectOcrBboxHints,
) {
  const session = await startHayaiRecognitionSession(input, normalize);
  sessions.push(session);
  return session;
}
beforeEach(async () => {
  vi.clearAllMocks();
  root = await mkdtemp(join(tmpdir(), "hayai-session-"));
  options = {
    imagePath: "page.png",
    outputDir: root,
    workingDir: root,
    ocrBboxRegionsPath: "regions.json",
    ocrPipeline: "hayai",
    ocrDevice: "cpu",
  } as TranslationOptions;
  boundary.prepare.mockResolvedValue({
    pythonPath: "python",
    runtimeDir: root,
  });
  boundary.script = `
    const fs = require('node:fs');
    const lines = require('node:readline').createInterface({ input: process.stdin });
    lines.on('line', line => {
      const request = JSON.parse(line);
      if (request.type === 'shutdown') { process.exit(0); return; }
      fs.appendFileSync(${JSON.stringify(join(root, "requests.jsonl"))}, line + '\\n');
      const failed = request.image === 'failed.png';
      if (!failed) fs.writeFileSync(request.output, JSON.stringify(${JSON.stringify(payload)}));
      process.stdout.write(JSON.stringify({ id: request.id, ok: !failed, error: failed ? 'model failed' : null, fatal: failed }) + '\\n');
    });`;
});
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((session) => session.dispose()));
  await rm(root, { recursive: true, force: true });
});

describe("Hayai recognition session adapter", () => {
  it.each(["cpu", "gpu"] as const)(
    "reports a dead %s worker without reading an old artifact",
    async (ocrDevice) => {
      boundary.script =
        "process.stderr.write('worker crashed'); process.exit(2);";
      const input = { ...options, ocrDevice };
      const session = await start(input);
      await expect(session.collect(input)).rejects.toMatchObject({
        nonRetriable: ocrDevice === "gpu",
      });
      await expect(session.collect(input)).rejects.toMatchObject({
        nonRetriable: ocrDevice === "gpu",
      });
    },
  );

  it("cancels an in-flight worker request and closes the process", async () => {
    boundary.script = "process.stdin.resume(); setInterval(() => {}, 1000);";
    const controller = new AbortController();
    const input = { ...options, abortSignal: controller.signal };
    const session = await start(input);
    const result = session.collect(input);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    await session.dispose();
  });

  it("forwards model download status through the existing progress handler", async () => {
    boundary.script =
      "process.stderr.write('Creating model: hayai\\n');\n" + boundary.script;
    const onProgress = vi.fn();
    const session = await start({ ...options, onProgress });
    await session.collect(options);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "ocr_running",
        detail: "Creating model: hayai",
      }),
    );
  });

  it("uses one real worker transport and existing normalizer for three pages", async () => {
    const session = await start();
    const expected = await actualOcr.collectOcrBboxHints({
      ...options,
      ocrBboxHints: payload,
    });
    for (let i = 0; i < 3; i++) {
      const result = await session.collect({
        ...options,
        imagePath: `page-${i}.png`,
      });
      expect(result.hints).toEqual(expected.hints);
      expect(result.noTextDetected).toBe(expected.noTextDetected);
      expect(result.textEvidenceCount).toBe(expected.textEvidenceCount);
    }
    expect(boundary.prepare).toHaveBeenCalledTimes(1);
    expect(boundary.spawn).toHaveBeenCalledTimes(1);
    expect(boundary.spawn.mock.calls[0][1]).toEqual(
      expect.arrayContaining(["--worker", "--device", "cpu"]),
    );
    expect(
      (await readFile(join(root, "requests.jsonl"), "utf8")).trim().split("\n"),
    ).toHaveLength(3);
    expect(
      JSON.parse(await readFile(join(root, "ocr-bbox-hints.json"), "utf8")),
    ).toEqual(payload);
  });
  it("never reads stale output after a failed response", async () => {
    const normalize = vi.fn(actualOcr.collectOcrBboxHints);
    const session = await start(options, normalize);
    await writeFile(join(root, "ocr-bbox-hints.json"), JSON.stringify(payload));
    await expect(
      session.collect({ ...options, imagePath: "failed.png" }),
    ).rejects.toMatchObject({ message: "model failed", nonRetriable: true });
    expect(normalize).not.toHaveBeenCalled();
  });
  it("preserves supplied OCR without installation or a worker", async () => {
    const supplied = { ...options, ocrBboxHints: payload };
    const session = await start(supplied);
    await session.collect(supplied);
    expect(boundary.spawn).not.toHaveBeenCalled();
    expect(boundary.prepare).not.toHaveBeenCalled();
  });
  it("preserves custom commands without adding the worker protocol", async () => {
    const normalize = vi.fn(actualOcr.collectOcrBboxHints);
    const session = await start(
      {
        ...options,
        ocrBboxCommand: JSON.stringify({
          executable: "custom-ocr.exe",
          args: ["{image}"],
        }),
      },
      normalize,
    );
    await session.collect({ ...options, ocrBboxHints: payload });
    expect(normalize).toHaveBeenCalledTimes(1);
    expect(boundary.spawn).not.toHaveBeenCalled();
  });
  it("does not launch a worker after cancellation during preparation", async () => {
    const controller = new AbortController();
    boundary.prepare.mockImplementation(async () => {
      controller.abort();
      return { pythonPath: "python" };
    });
    await expect(
      start({ ...options, abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(boundary.spawn).not.toHaveBeenCalled();
  });
});
