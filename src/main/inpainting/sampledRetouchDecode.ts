import {
  loadRuntimeModuleFromDirectory,
  assertRuntimeFunctions,
} from "../runtimeModuleLoader";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SampledWorkerRequest } from "./sampledRetouchWorkerProtocol";

export function requiresNativeSampledDecode(bytes: Buffer): boolean {
  if (
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return true;
  // pngjs exposes raw samples; Chromium applies embedded color metadata.
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (["gAMA", "iCCP", "cHRM", "sRGB", "cICP"].includes(type)) return true;
    if (length > bytes.length - offset - 12) return true;
    offset += length + 12;
  }
  return false;
}

export async function normalizeSampledImage(
  path: string,
  task: SampledWorkerRequest,
): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setInterval(() => {
    if (Atomics.load(new Int32Array(task.cancel), 0)) controller.abort();
  }, 25);
  try {
    if (task.decoder) {
      const native = await nativeNormalize(
        path,
        task.decoder,
        controller.signal,
      );
      if (native) return native;
    }
    const loaded = loadRuntimeModuleFromDirectory(
      task.runtimeDir,
      "imageSourceAssets",
    );
    assertRuntimeFunctions(loaded, "imageSourceAssets", [
      "convertImageToPngBufferWithFfmpeg",
    ]);
    const runtime = loaded as {
      convertImageToPngBufferWithFfmpeg(
        path: string,
        options: { abortSignal: AbortSignal },
      ): Promise<Buffer>;
    };
    return await runtime.convertImageToPngBufferWithFfmpeg(path, {
      abortSignal: controller.signal,
    });
  } finally {
    clearInterval(timer);
  }
}

async function nativeNormalize(
  path: string,
  decoder: NonNullable<SampledWorkerRequest["decoder"]>,
  signal: AbortSignal,
): Promise<Buffer | null> {
  const directory = await mkdtemp(join(tmpdir(), "mgt-stamp-decode-"));
  const output = join(directory, "normalized.png");
  try {
    const code = await runDecoder(decoder, path, output, signal);
    if (code === 3) return null; // Same native-empty fallback as loadPageImage.
    if (code !== 0)
      throw new Error(`이미지 정규화 프로세스가 종료되었습니다 (${code}).`);
    return await readFile(output);
  } finally {
    await rm(output, { force: true });
    await rmdir(directory);
  }
}

function runDecoder(
  decoder: NonNullable<SampledWorkerRequest["decoder"]>,
  input: string,
  output: string,
  signal: AbortSignal,
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const args = decoder.packaged ? [] : [decoder.bootstrap];
    args.push("--mgt-sampled-image-decode", input, output);
    const child = spawn(decoder.executable, args, {
      windowsHide: true,
      stdio: "ignore",
      signal,
    });
    let failure: Error | undefined;
    child.once("error", (error) => {
      failure = error;
    });
    // Close means all child handles are closed; cleanup can safely remove its output.
    child.once("close", (code) =>
      failure
        ? reject(failure)
        : signal.aborted
          ? reject(new Error("도장 작업을 취소했습니다."))
          : resolve(code),
    );
  });
}
