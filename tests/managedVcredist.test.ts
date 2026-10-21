import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RUNTIME_INTEGRITY_MANIFEST } from "../src/main/runtimeSupport/runtimeIntegrity";

const bytes = Buffer.from("verified installer fixture");
const digest = createHash("sha256").update(bytes).digest("hex");
const childProcess = require("node:child_process");
const platform = Object.getOwnPropertyDescriptor(process, "platform");
if (!platform) throw new Error("Missing process platform descriptor");
const modules = [
  "../src/main/runtime/ocr/managed-vcredist.cjs",
  "../src/main/runtime/simple-page-shell-utils.cjs",
  "../src/main/runtime/transport/shell-command.cjs",
];
let root: string;
let file: string;
let ensure: (options: object, root: string) => Promise<void>;
let launches: { command: string; args: string[] }[];
let downloads: number;
let corruptDownload: boolean;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "mgt-vcredist-test-"));
  file = join(root, ".downloads", "vcredist", "vc_redist.x64.exe");
  await mkdir(dirname(file), { recursive: true });
  launches = [];
  downloads = 0;
  corruptDownload = false;
  Object.defineProperty(process, "platform", { value: "win32" });
  vi.stubEnv(
    "MANGA_TRANSLATOR_VCREDIST_X64_URL",
    "https://example.invalid/vc.exe",
  );
  vi.stubEnv("MANGA_TRANSLATOR_VCREDIST_X64_SHA256", digest);
  vi.stubEnv("MANGA_TRANSLATOR_DOWNLOAD_RETRY_COUNT", "1");
  vi.spyOn(childProcess, "spawn").mockImplementation((...args: unknown[]) => {
    launches.push({ command: String(args[0]), args: args[1] as string[] });
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
    });
    queueMicrotask(() => child.emit("close", 0));
    return child;
  });
  vi.stubGlobal("fetch", async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "HEAD")
      return new Response(null, {
        headers: { "content-length": String(bytes.length) },
      });
    downloads++;
    return new Response(corruptDownload ? Buffer.alloc(bytes.length) : bytes, {
      headers: { "content-length": String(bytes.length) },
    });
  });
  for (const name of modules) delete require.cache[require.resolve(name)];
  ensure = require(modules[0]).ensureMicrosoftVisualCppRuntimeForOcr;
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  Object.defineProperty(process, "platform", platform);
  for (const name of modules) delete require.cache[require.resolve(name)];
  await rm(root, { recursive: true, force: true });
});

describe("managed Visual C++ installer integrity", () => {
  it("pins a Microsoft version-specific URL and digest", () => {
    const asset = RUNTIME_INTEGRITY_MANIFEST.vcredistX64;
    expect(asset.url).toMatch(
      /^https:\/\/download\.visualstudio\.microsoft\.com\/download\/pr\//,
    );
    expect(asset.url.toLowerCase()).toContain(asset.sha256);
    expect(asset.bytes).toBeGreaterThan(0);
  });
  it.each(["fresh", "corrupt-cache", "forged-cache-marker"])(
    "downloads and verifies %s before execution",
    async (scenario) => {
      if (scenario !== "fresh")
        await writeFile(file, "corrupt cached executable");
      if (scenario === "forged-cache-marker") {
        const info = statSync(file);
        writeFileSync(
          file + ".mgt-sha256.json",
          JSON.stringify({
            sha256: digest,
            size: info.size,
            mtimeMs: info.mtimeMs,
          }),
        );
      }
      await ensure({}, root);
      expect(downloads).toBeGreaterThan(0);
      expect(launches).toEqual([
        { command: file, args: ["/install", "/quiet", "/norestart"] },
      ]);
      expect(await readFile(file)).toEqual(bytes);
    },
  );
  it("reuses only a verified cached installer", async () => {
    await writeFile(file, bytes);
    await ensure({}, root);
    expect(downloads).toBe(0);
    expect(launches).toHaveLength(1);
  });
  it("never executes a corrupt download", async () => {
    corruptDownload = true;
    await expect(ensure({}, root)).rejects.toThrow();
    expect(launches).toHaveLength(0);
  });
  it("rejects an override without its own digest", async () => {
    vi.stubEnv("MANGA_TRANSLATOR_VCREDIST_X64_SHA256", undefined);
    await expect(ensure({}, root)).rejects.toThrow(/pinned SHA-256/);
    expect(downloads).toBe(0);
    expect(launches).toHaveLength(0);
  });
});
