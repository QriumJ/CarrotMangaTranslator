import { afterEach, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";
import type { TranslationOptions } from "../src/main/appSettings";
import {
  startHunyuanServer,
  type HunyuanServer,
} from "../src/main/runtimeSupport/hunyuanServer";

const boundary = vi.hoisted(() => ({
  children: [] as ChildProcess[],
  failStartup: false,
}));
// Substitute only the native binary. Port reservation, HTTP readiness,
// process ownership, diagnostics and Windows child-tree termination stay real.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (
      executable: string,
      args: string[],
      options: import("node:child_process").SpawnOptions,
    ) => {
      if (executable !== "hunyuan-test-binary")
        return actual.spawn(executable, args, options);
      const port = Number(args[args.indexOf("--port") + 1]);
      const script = boundary.failStartup
        ? "console.error('CUDA error: out of memory'); process.exit(7)"
        : `require('node:http').createServer((req,res) => { res.end('{}'); }).listen(${port}, '127.0.0.1')`;
      const child = actual.spawn(process.execPath, ["-e", script], options);
      boundary.children.push(child);
      return child;
    },
  };
});

const servers: HunyuanServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
  for (const child of boundary.children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
  boundary.failStartup = false;
});

async function start(signal?: AbortSignal) {
  const input: Partial<TranslationOptions> = { abortSignal: signal };
  const server = await startHunyuanServer(
    input as TranslationOptions,
    { model: "f16", device: "cpu", backend: "cpu" },
    { modelPath: "text.gguf", projectorPath: "vision.gguf" },
    "hunyuan-test-binary",
  );
  servers.push(server);
  return server;
}

it("waits for readiness and confirms the owned process exits before disposal returns", async () => {
  const server = await start();
  expect((await fetch(`${server.baseUrl}/health`)).ok).toBe(true);
  const child = boundary.children[0];
  await server.dispose();
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  await server.dispose();
  expect(() => server.assertAlive()).toThrow("exited");
});

it("terminates the running native process on cancellation", async () => {
  const controller = new AbortController();
  const server = await start(controller.signal);
  controller.abort();
  await server.dispose();
  const child = boundary.children[0];
  expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  expect(() => server.assertAlive()).toThrow();
});

it("surfaces startup crash diagnostics and closes the failed process", async () => {
  boundary.failStartup = true;
  await expect(start()).rejects.toThrow("CUDA error: out of memory");
  expect(boundary.children[0].exitCode).toBe(7);
});

it("detects an unexpected exit after readiness", async () => {
  const server = await start();
  const child = boundary.children[0];
  const closed = new Promise<void>((resolve) =>
    child.once("close", () => resolve()),
  );
  child.kill();
  await closed;
  expect(() => server.assertAlive()).toThrow("server exited");
});
