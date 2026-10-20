import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  createReadStream,
  createWriteStream,
} from "node:fs";
import { mkdir, rm, writeFile, chmod } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress } from "node:zlib";
import { join, resolve } from "node:path";
import {
  assertRuntimeFunctions,
  loadAppRuntimeModule,
} from "../runtimeModuleLoader";
import { cliRuntimePlan, type ManagedCli } from "./cliRuntimePlan";
import { ensureRemoteFile, type RuntimeAssetProgress } from "./modelDownloads";
import {
  createRuntimeStagingDirectory,
  replaceDirectoryWithRollback,
} from "./runtimeDirectoryPublish";

export type CliInstallOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: RuntimeAssetProgress) => void;
};
type Plan = ReturnType<typeof cliRuntimePlan>;
type Receipt = { sha256: string; files: { path: string; bytes: number }[] };
type InstallRuntime = { download: typeof ensureRemoteFile };
const pending = new Map<string, Promise<string>>();

export class CliNotInstalledError extends Error {
  constructor(provider: ManagedCli) {
    super(
      `${provider} 실행 파일이 아직 설치되지 않았습니다. 계정을 연결하면 자동으로 내려받습니다.`,
    );
    this.name = "CliNotInstalledError";
  }
}

function runtimeDirectory(dataRoot: string, plan: Plan): string {
  return join(
    dataRoot,
    "cli-runtimes",
    plan.provider,
    `${plan.version}-${plan.sha256.slice(0, 12)}`,
  );
}

/** A local-only probe: opening settings or polling accounts never downloads. */
export function findManagedCli(
  dataRoot: string | undefined,
  provider: ManagedCli,
  platform: string = process.platform,
  arch: string = process.arch,
): string | null {
  if (!dataRoot || !existsSync(join(dataRoot, "cli-runtimes", provider)))
    return null;
  const plan = cliRuntimePlan(provider, platform, arch);
  const directory = runtimeDirectory(dataRoot, plan);
  if (!existsSync(join(directory, ".installed.json"))) return null;
  assertManagedDirectories(dataRoot, plan);
  try {
    const receipt = JSON.parse(
      readFileSync(join(directory, ".installed.json"), "utf8"),
    ) as Receipt;
    if (
      receipt.sha256 !== plan.sha256 ||
      !Array.isArray(receipt.files) ||
      !receipt.files.some((file) => file.path === plan.executable)
    )
      return null;
    const actual = inventory(directory);
    if (JSON.stringify(actual) !== JSON.stringify(receipt.files)) return null;
    return join(directory, plan.executable);
  } catch (_error) {
    // error-policy-allow: an incomplete or invalid cache is repaired on explicit use.
    return null;
  }
}

export async function ensureManagedCli(
  dataRoot: string,
  provider: ManagedCli,
  options: CliInstallOptions = {},
  runtime: InstallRuntime = { download: ensureRemoteFile },
): Promise<string> {
  options.signal?.throwIfAborted();
  const installed = findManagedCli(dataRoot, provider);
  if (installed) return installed;
  const plan = cliRuntimePlan(provider);
  const directory = runtimeDirectory(dataRoot, plan);
  const prior = pending.get(directory);
  if (prior) {
    await waitForInstall(prior, options.signal);
    return ensureManagedCli(dataRoot, provider, options, runtime);
  }
  const installation = install(dataRoot, plan, options, runtime);
  pending.set(directory, installation);
  try {
    return await installation;
  } finally {
    pending.delete(directory);
  }
}

async function waitForInstall(
  prior: Promise<string>,
  signal?: AbortSignal,
): Promise<void> {
  await new Promise<void>((resolveWait, reject) => {
    const abort = () => reject(signal?.reason);
    signal?.addEventListener("abort", abort, { once: true });
    const settled = () => {
      signal?.removeEventListener("abort", abort);
      if (signal?.aborted) reject(signal.reason);
      else resolveWait();
    };
    // Independent callers can retry if the owner cancelled or failed.
    void prior.then(settled, settled);
  });
}

async function install(
  dataRoot: string,
  plan: Plan,
  options: CliInstallOptions,
  runtime: InstallRuntime,
): Promise<string> {
  assertManagedDirectories(dataRoot, plan);
  const directory = runtimeDirectory(dataRoot, plan);
  const stage = createRuntimeStagingDirectory(directory);
  await mkdir(stage, { recursive: true });
  try {
    const archive = await runtime.download({
      modelDir: stage,
      fileName: "runtime.tgz",
      url: plan.url,
      label: { claude: "Claude", codex: "Codex", grok: "Grok" }[plan.provider],
      expectedSha256: plan.sha256,
      minimumBytes: plan.bytes,
      maximumBytes: plan.bytes,
      expectedTotalBytes: plan.bytes,
      ...options,
    });
    options.signal?.throwIfAborted();
    const module = loadAppRuntimeModule("tarExtractor");
    assertRuntimeFunctions(module, "CLI runtime archive", [
      "extractSelectedTarEntries",
    ]);
    const extract = module.extractSelectedTarEntries as (
      archive: string,
      output: string,
      select: () => boolean,
      options: { stripComponents: number; abortSignal?: AbortSignal },
    ) => Promise<void>;
    const unpacked = join(stage, "unpacked");
    // Preserve every upstream executable, sibling resource and license.
    await extract(archive, unpacked, () => true, {
      stripComponents: 1,
      abortSignal: options.signal,
    });
    if (plan.compressedExecutable) {
      await pipeline(
        createReadStream(join(unpacked, plan.compressedExecutable)),
        createBrotliDecompress(),
        createWriteStream(join(unpacked, plan.executable), {
          flags: "wx",
          mode: 0o755,
        }),
        { signal: options.signal },
      );
      await chmod(join(unpacked, plan.executable), 0o755);
      await rm(join(unpacked, plan.compressedExecutable));
    }
    const manifest = JSON.parse(
      readFileSync(join(unpacked, "package.json"), "utf8"),
    ) as { version?: string };
    if (
      manifest.version !== plan.version ||
      !lstatSync(join(unpacked, plan.executable)).isFile()
    )
      throw new Error(
        "다운로드한 CLI의 버전 또는 실행 파일이 올바르지 않습니다.",
      );
    const files = inventory(unpacked);
    await writeFile(
      join(unpacked, ".installed.json"),
      JSON.stringify({ sha256: plan.sha256, files } satisfies Receipt),
    );
    options.signal?.throwIfAborted();
    assertManagedDirectories(dataRoot, plan);
    await replaceDirectoryWithRollback(unpacked, directory);
    return join(directory, plan.executable);
  } finally {
    // Only this randomly created staging directory; never library/auth data.
    await rm(stage, { recursive: true, force: true });
  }
}

function assertManagedDirectories(dataRoot: string, plan: Plan): void {
  for (const path of [
    join(dataRoot, "cli-runtimes"),
    join(dataRoot, "cli-runtimes", plan.provider),
    runtimeDirectory(dataRoot, plan),
  ]) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink())
      throw new Error(`CLI cache link is not allowed: ${resolve(path)}`);
  }
  const directory = runtimeDirectory(dataRoot, plan);
  if (existsSync(directory)) inventory(directory);
}

function inventory(root: string, prefix = ""): Receipt["files"] {
  return readdirSync(join(root, prefix), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink())
        throw new Error(`CLI cache link is not allowed: ${path}`);
      if (entry.isDirectory()) return inventory(root, path);
      if (path === ".installed.json") return [];
      const stat = lstatSync(join(root, path));
      if (!stat.isFile()) throw new Error(`Invalid CLI cache file: ${path}`);
      return [{ path, bytes: stat.size }];
    });
}
