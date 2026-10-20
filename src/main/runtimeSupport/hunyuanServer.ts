import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import type { TranslationOptions } from "../appSettings";
import type { HunyuanExecution } from "../../shared/hunyuanOcr";
import { loadAppRuntimeModule } from "../runtimeModuleLoader";
import { hunyuanLaunchArgs } from "./hunyuanLaunch";

export type HunyuanServer = {
  baseUrl: string;
  headers: Record<string, string>;
  assertAlive: () => void;
  dispose: () => Promise<void>;
};

export async function startHunyuanServer(
  options: TranslationOptions,
  execution: HunyuanExecution,
  assets: { modelPath: string; projectorPath: string },
  serverPath: string,
): Promise<HunyuanServer> {
  options.abortSignal?.throwIfAborted();
  if (execution.device === "gpu" && execution.backend === "cpu")
    throw new Error("Hunyuan GPU unavailable");
  const port = await unusedPort();
  const apiKey = randomUUID();
  const args = hunyuanLaunchArgs({
    ...assets,
    execution,
    port,
    apiKey,
    computeGpuIndex: options.computeGpuIndex,
  });
  const child = spawn(serverPath, args, {
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...(execution.device === "cpu" ? { CUDA_VISIBLE_DEVICES: "-1" } : {}),
    },
  });
  const server = ownServer(child, options.abortSignal);
  const handle = {
    ...server,
    baseUrl: `http://127.0.0.1:${port}`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  };
  try {
    await waitForHunyuan(handle, options.abortSignal);
    return handle;
  } catch (error) {
    await handle.dispose();
    throw error;
  }
}

function ownServer(child: ChildProcess, signal?: AbortSignal) {
  let recent = "";
  let spawnError: Error | undefined;
  let closed = false;
  let stopping: Promise<void> | undefined;
  const exited = new Promise<void>((resolve) => {
    child.once("close", () => {
      closed = true;
      resolve();
    });
  });
  child.once("error", (error) => {
    spawnError = error;
  });
  const append = (chunk: Buffer) => {
    recent = (recent + chunk.toString()).slice(-16384);
  };
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);
  const { terminateChildProcessTree } = loadAppRuntimeModule(
    "processTermination",
  ) as {
    terminateChildProcessTree: (child: ChildProcess) => void;
  };
  const onAbort = () => terminateChildProcessTree(child);
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();
  return {
    assertAlive() {
      signal?.throwIfAborted();
      if (spawnError) throw spawnError;
      if (closed || child.exitCode !== null || child.signalCode !== null)
        throw new Error(
          `HunyuanOCR server exited (${child.exitCode}): ${recent}`,
        );
    },
    dispose() {
      stopping ??= (async () => {
        signal?.removeEventListener("abort", onAbort);
        terminateChildProcessTree(child);
        await exited;
      })();
      return stopping;
    },
  };
}

async function waitForHunyuan(server: HunyuanServer, signal?: AbortSignal) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    server.assertAlive();
    try {
      const response = await fetch(`${server.baseUrl}/health`, {
        headers: server.headers,
        signal: AbortSignal.any([
          AbortSignal.timeout(1000),
          ...(signal ? [signal] : []),
        ]),
      });
      if (response.ok) return;
      await response.body?.cancel();
    } catch (error) {
      // A connection refusal is expected until the owned process binds its port.
      if (signal?.aborted) throw error;
      server.assertAlive();
    }
    await delay(150, undefined, { signal });
  }
  throw new DOMException(
    "HunyuanOCR server startup timed out.",
    "TimeoutError",
  );
}

async function unusedPort(): Promise<number> {
  const reservation = createServer();
  return new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      if (!address || typeof address === "string") {
        reservation.close();
        reject(new Error("HunyuanOCR could not reserve a local port."));
        return;
      }
      reservation.close((error) =>
        error ? reject(error) : resolve(address.port),
      );
    });
  });
}
