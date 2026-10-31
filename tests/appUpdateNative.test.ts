import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

it.skipIf(process.platform !== "win32")(
  "downloads with Electron, reuses verified cache after restart, replaces corruption and cancels without retry",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "carrot-updater-한글-"));
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      MGT_UPDATE_TEST_ROOT: root,
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(
      require("electron") as string,
      [join(__dirname, "fixtures/appUpdateDownload.mjs")],
      { env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    const timeout = setTimeout(() => child.kill(), 25_000);
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      });
      expect(code, output).toBe(0);
      expect(
        JSON.parse(await readFile(join(root, "result.json"), "utf8")),
      ).toMatchObject({
        passed: true,
        downloadRequests: 3,
        cacheReuse: true,
        corruptCacheReplaced: true,
        cancellation: true,
      });
    } finally {
      clearTimeout(timeout);
      await rm(root, { recursive: true, force: true });
    }
  },
  30_000,
);
