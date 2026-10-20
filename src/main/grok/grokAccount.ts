import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AppPaths } from "../appPaths";
import type { GrokAccount } from "../../shared/grokTypes";
import {
  ensureManagedCli,
  findManagedCli,
  type CliInstallOptions,
} from "../runtimeSupport/managedCliRuntime";
import {
  GROK_VERSION,
  grokAccountFromInitialization,
  grokEnvironment,
  startGrokRuntime,
} from "./grokRuntime";

const reading = new Map<string, Promise<GrokAccount>>();
export type GrokAccountRuntime = {
  find: typeof findManagedCli;
  install: typeof ensureManagedCli;
  start: typeof startGrokRuntime;
};
const productionRuntime: GrokAccountRuntime = {
  find: findManagedCli,
  install: ensureManagedCli,
  start: startGrokRuntime,
};
export function readGrokAccount(
  paths: AppPaths,
  runtime: GrokAccountRuntime = productionRuntime,
): Promise<GrokAccount> {
  let pending = reading.get(paths.dataRoot);
  if (!pending) {
    pending = readAccount(paths, runtime).finally(() =>
      reading.delete(paths.dataRoot),
    );
    reading.set(paths.dataRoot, pending);
  }
  return pending;
}
async function readAccount(
  paths: AppPaths,
  adapter: GrokAccountRuntime,
): Promise<GrokAccount> {
  if (!adapter.find(paths.dataRoot, "grok"))
    return {
      runtimeInstalled: false,
      authenticated: false,
      version: GROK_VERSION,
      models: [],
    };
  const runtime = await adapter.start(paths);
  try {
    // initialize advertises cached_token only when the official CLI has a usable
    // login. Never call authenticate from a settings poll: it can open a browser.
    return grokAccountFromInitialization(runtime.initialization);
  } finally {
    await runtime.client.close();
  }
}
export async function authenticateGrok(
  paths: AppPaths,
  action: "login" | "logout",
  signal?: AbortSignal,
  onProgress?: CliInstallOptions["onProgress"],
  onAuthenticate?: () => void,
  runtime: GrokAccountRuntime = productionRuntime,
): Promise<GrokAccount> {
  signal?.throwIfAborted();
  const installed = runtime.find(paths.dataRoot, "grok");
  if (action === "logout" && !installed) return readGrokAccount(paths, runtime);
  const executable =
    installed ??
    (await runtime.install(paths.dataRoot, "grok", { signal, onProgress }));
  signal?.throwIfAborted();
  const cwd = join(paths.dataRoot, "grok");
  await mkdir(cwd, { recursive: true });
  onAuthenticate?.();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      executable,
      action === "login" ? ["login", "--oauth"] : ["logout"],
      {
        cwd,
        env: grokEnvironment(paths),
        windowsHide: true,
        stdio: "ignore",
        signal,
      },
    );
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Grok 인증에 실패했습니다 (${code}). 로그인 창을 확인해 주세요.`,
            ),
          ),
    );
  });
  // A poll started before login must not overwrite the fresh authentication result.
  await reading.get(paths.dataRoot);
  return readGrokAccount(paths, runtime);
}
