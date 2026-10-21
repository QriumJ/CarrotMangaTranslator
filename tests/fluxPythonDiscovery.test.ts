import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZipFile } from "yazl";
import { findPythonCommand } from "../src/main/inpainting/fluxAssets/pythonBootstrap";
import { RUNTIME_INTEGRITY_MANIFEST } from "../src/main/runtimeSupport/runtimeIntegrity";
import { ensureMissingFluxPythonRuntime } from "../src/main/inpainting/fluxAssets/pythonRuntimeInstaller";
import {
  findFluxPythonWorkerSource,
  resolveCurrentFluxPythonRuntime,
  resolveFluxPythonRuntimeLayout,
  resolveFluxPythonWorkerFile,
} from "../src/main/inpainting/fluxAssets/pythonRuntimeLayout";
import { verifyFluxPythonRuntime } from "../src/main/inpainting/fluxAssets/pythonRuntimePackages";

const boundary = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawn: boundary.spawn,
}));
vi.mock("electron", () => ({ app: { isPackaged: false } }));

const platform = Object.getOwnPropertyDescriptor(process, "platform");
if (!platform) throw new Error("Missing process platform descriptor");
const roots: string[] = [];
const order: string[] = [];
const fetchBoundary = vi.fn<typeof fetch>();

beforeEach(() => {
  Object.defineProperty(process, "platform", { value: "win32" });
  for (const prefix of ["MANGA_TRANSLATOR_FLUX_", "MGT_FLUX_"])
    for (const suffix of [
      "PYTHON",
      "PYTHON_VERSION",
      "PYTHON_URL",
      "PYTHON_SHA256",
      "GET_PIP_URL",
      "GET_PIP_SHA256",
      "ALLOW_SYSTEM_PYTHON",
    ])
      vi.stubEnv(prefix + suffix, undefined);
  vi.stubEnv("MGT_FLUX_ALLOW_SYSTEM_PYTHON", "0");
  order.length = 0;
  boundary.spawn.mockReset().mockImplementation((command: string) => {
    order.push(`probe:${command}`);
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      stdin: null,
      kill: vi.fn(),
    });
    queueMicrotask(() =>
      child.emit("exit", command === "missing-python" ? 1 : 0),
    );
    return child;
  });
  fetchBoundary.mockReset().mockImplementation(async (_url, init) => {
    order.push(`download:${init?.method ?? "GET"}`);
    return new Response(null, {
      status: 404,
      statusText: "Bootstrap unavailable",
    });
  });
  vi.stubGlobal("fetch", fetchBoundary);
});

afterEach(async () => {
  Object.defineProperty(process, "platform", platform);
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) {
    expect(resolve(root).startsWith(resolve(tmpdir()) + sep)).toBe(true);
    await rm(root, { recursive: true, force: true });
  }
});

describe("Windows Flux Python discovery", () => {
  it.each([false, true])(
    "uses the pinned bootstrap URL and rejects changed bytes: tampered=%s",
    async (tampered) => {
      const runtimeDir = await emptyRuntime();
      const zip = new ZipFile();
      zip.addBuffer(Buffer.from("fixture python"), "python.exe");
      zip.addBuffer(Buffer.from(".\n#import site\n"), "python314._pth");
      zip.end();
      const chunks: Buffer[] = [];
      for await (const chunk of zip.outputStream)
        chunks.push(Buffer.from(chunk));
      const archive = Buffer.concat(chunks);
      const script = Buffer.from("fixture bootstrap script");
      vi.stubEnv(
        "MGT_FLUX_PYTHON_SHA256",
        createHash("sha256").update(archive).digest("hex"),
      );
      vi.stubEnv(
        "MGT_FLUX_GET_PIP_SHA256",
        createHash("sha256").update(script).digest("hex"),
      );
      vi.stubEnv("MANGA_TRANSLATOR_DOWNLOAD_RETRY_COUNT", "1");
      const manifest = RUNTIME_INTEGRITY_MANIFEST.fluxManagedPython;
      fetchBoundary.mockImplementation(async (input) => {
        const url = String(input);
        if (url === manifest.archive.url) return new Response(archive);
        expect(url).toBe(manifest.getPip.url);
        return new Response(
          tampered ? Buffer.from("upstream changed") : script,
        );
      });
      const result = findPythonCommand({ runtimeDir });
      if (tampered) {
        await expect(result).rejects.toThrow(/체크섬|checksum/i);
        expect(boundary.spawn).not.toHaveBeenCalled();
      } else {
        await expect(result).resolves.toMatchObject({ args: [] });
        const calls = boundary.spawn.mock.calls;
        expect(calls[0]?.[1]?.[0]).toBe(
          join(runtimeDir, ".downloads", "python", "get-pip.py"),
        );
        const downloads = fetchBoundary.mock.calls.length;
        await findPythonCommand({ runtimeDir });
        expect(fetchBoundary).toHaveBeenCalledTimes(downloads);
        expect(
          boundary.spawn.mock.calls.filter(([, args]) =>
            args[0]?.endsWith("get-pip.py"),
          ),
        ).toHaveLength(1);
      }
    },
  );

  it("selects a configured interpreter without provisioning the managed runtime", async () => {
    const runtimeDir = await emptyRuntime();
    vi.stubEnv("MGT_FLUX_PYTHON", "configured-python");
    await expect(findPythonCommand({ runtimeDir })).resolves.toEqual({
      command: "configured-python",
      args: [],
    });
    expect(boundary.spawn).toHaveBeenCalledExactlyOnceWith(
      "configured-python",
      ["--version"],
      expect.any(Object),
    );
    expect(fetchBoundary).not.toHaveBeenCalled();
    expect(await readdir(runtimeDir)).toEqual([]);
  });

  it("tries an allowed system interpreter after the override and managed download fail", async () => {
    const runtimeDir = await emptyRuntime();
    vi.stubEnv("MGT_FLUX_PYTHON", "missing-python");
    vi.stubEnv("MGT_FLUX_ALLOW_SYSTEM_PYTHON", "true");
    await expect(findPythonCommand({ runtimeDir })).resolves.toEqual({
      command: "py",
      args: ["-3"],
    });
    expect(order[0]).toBe("probe:missing-python");
    expect(order).toContain("download:GET");
    expect(order.at(-1)).toBe("probe:py");
    expect(
      boundary.spawn.mock.calls.map(([command, args]) => [command, args]),
    ).toEqual([
      ["missing-python", ["--version"]],
      ["py", ["-3", "--version"]],
    ]);
  });

  it("preserves the managed provisioning failure when system fallback is disabled", async () => {
    const runtimeDir = await emptyRuntime();
    vi.stubEnv("MGT_FLUX_PYTHON", "missing-python");
    await expect(findPythonCommand({ runtimeDir })).rejects.toThrow(/404/);
    expect(order).toContain("download:GET");
    expect(boundary.spawn).toHaveBeenCalledOnce();
  });
});

async function emptyRuntime() {
  const directory = await mkdtemp(join(tmpdir(), "flux-python-discovery-"));
  roots.push(directory);
  return directory;
}

describe("Flux target runtime installation and cache reuse", () => {
  it.each(["python3", "python", "py", "absolute"] as const)(
    "reuses an installed %s interpreter without repeating pip installation",
    async (selection) => {
      const root = await emptyRuntime();
      Object.defineProperty(process, "platform", {
        value:
          selection === "py" || selection === "absolute" ? "win32" : "linux",
      });
      const executable = join(root, "interpreter.exe");
      await writeFile(executable, "external process fixture");
      if (selection === "absolute") vi.stubEnv("MGT_FLUX_PYTHON", executable);
      if (selection === "py")
        vi.stubEnv("MGT_FLUX_ALLOW_SYSTEM_PYTHON", "true");
      const layout = resolveFluxPythonRuntimeLayout(root, "python-cpu");
      expect(resolve(layout.runtimeDir).startsWith(resolve(root) + sep)).toBe(
        true,
      );
      boundary.spawn.mockImplementation((command: string, args: string[]) => {
        const child = Object.assign(new EventEmitter(), {
          stdout: new PassThrough(),
          stderr: new PassThrough(),
          stdin: null,
          kill: vi.fn(),
        });
        queueMicrotask(() => {
          if (selection === "python" && command === "python3") {
            child.emit("exit", 1);
            return;
          }
          const targetIndex = args.indexOf("--target");
          if (targetIndex >= 0) {
            const target = args[targetIndex + 1];
            expect(target).toBe(layout.packageDir);
            for (const module of ["torch", "diffusers", "transformers"])
              mkdirSync(join(target, module), { recursive: true });
          }
          if (args.some((arg) => arg.includes("sys.executable")))
            child.stdout.write(`${executable}\n`);
          child.emit("exit", 0);
          child.emit("close", 0);
        });
        return child;
      });
      const worker = resolveFluxPythonWorkerFile("python-cpu");
      const source = findFluxPythonWorkerSource(worker);
      if (!source) throw new Error("Expected packaged worker source");
      const expectedMarker = {
        backend: "python-cpu" as const,
        integrityId: "fixture-runtime-lock",
        buildPackages: [],
        packages: ["torch", "diffusers", "transformers"],
        runtimeInstallBatches: [],
        worker,
        workerHash: createHash("sha256")
          .update(await readFile(source))
          .digest("hex"),
      };
      const installed = await ensureMissingFluxPythonRuntime({
        backend: "python-cpu",
        layout,
        workerFile: worker,
        expectedMarker,
        buildPackages: [],
        extraPackages: expectedMarker.packages,
        runtimeInstallBatches: [],
      });
      const pipCalls = () =>
        boundary.spawn.mock.calls.filter(([, args]) => args.includes("pip"));
      expect(pipCalls().length).toBeGreaterThan(0);
      const installationCount = pipCalls().length;
      const installedMarker = await readFile(layout.markerPath, "utf8");
      const cached = await resolveCurrentFluxPythonRuntime({
        ...layout,
        expectedMarker,
      });
      expect(cached).not.toBeNull();
      if (!cached) throw new Error("Expected installed runtime cache hit");
      expect([cached.command, cached.args]).toEqual([
        installed.command,
        installed.args,
      ]);
      expect(cached.packageDir).toBe(layout.packageDir);
      await verifyFluxPythonRuntime(cached, "python-cpu");
      expect(pipCalls()).toHaveLength(installationCount);
      expect(await readFile(layout.markerPath, "utf8")).toBe(installedMarker);
    },
  );
});
