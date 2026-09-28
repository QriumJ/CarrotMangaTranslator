// @ts-check
const { createHash } = require("node:crypto");
const {
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
} = require("node:fs/promises");
const path = require("node:path");
const { resolveLlamaCppCacheDir } = require("../simple-page-cache-paths.cjs");
const { buildLaunchArgs } = require("../model/launch-arguments.cjs");
const { shouldCalibrateMtpFit } = require("../model/mtp-fit-calibration.cjs");
const { buildLlamaServerEnv } = require("../model/server-environment.cjs");

/** @typedef {import("../runtime-jsdoc-types").RuntimeOptions & Record<string, any>} Options */
/** @typedef {{ target: number; free: number; gap: number; savedAt: number }} Entry */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
// Allow small WDDM fluctuations within the minimum learned recovery reserve.
// A larger change still requires a fresh fit, and every hit is health-checked.
const MEMORY_TOLERANCE_MIB = 512;

/** @param {string} serverPath @param {Options} options */
async function prepareMtpFitCache(serverPath, options) {
  const cachePath = await resolveCachePath(serverPath, options);
  return {
    cached: cachePath ? await readEntry(cachePath, options) : null,
    /** @param {number} target */
    async recordTarget(target) {
      if (
        cachePath &&
        target > Number(options.fitTargetMb) &&
        validTarget(target, options)
      ) {
        await saveEntry(cachePath, {
          target,
          free: options.mtpFitPhysicalFreeMiB,
          gap: options.mtpFitMemoryGapMiB,
          savedAt: Date.now(),
        });
      }
    },
    async invalidate() {
      if (cachePath) await discardEntry(cachePath);
    },
  };
}

/** @param {string} serverPath @param {Options} options */
async function resolveCachePath(serverPath, options) {
  if (!shouldCalibrateMtpFit(options) || !validBudget(options)) return null;
  try {
    const root = resolveLlamaCppCacheDir(options);
    if (!root) return null;
    // The actual launch contract covers context, KV, batch, draft and offload
    // options. The ephemeral listening port must not defeat cross-job reuse.
    const args = buildLaunchArgs({ ...options, port: 0 });
    const files = [serverPath];
    for (let index = 0; index < args.length; index++) {
      if (
        [
          "-m",
          "--mmproj",
          "--spec-draft-model",
          "--chat-template-file",
        ].includes(args[index])
      ) {
        files.push(args[index + 1]);
      }
    }
    // Do not trust remote/unresolved weights or a same-path binary replacement.
    if (!args.includes("-m") || !args.includes("--spec-draft-model"))
      return null;
    for (const name of await readdir(path.dirname(serverPath))) {
      if (/\.dll$/i.test(name))
        files.push(path.join(path.dirname(serverPath), name));
    }
    const identities = await Promise.all(files.sort().map(fileIdentity));
    const env = buildLlamaServerEnv(serverPath, options);
    const computeEnv = Object.entries(env)
      .filter(([key]) => /^(GGML_|CUDA_|LLAMA_)/.test(key))
      .sort(([left], [right]) => left.localeCompare(right));
    const key = createHash("sha256")
      .update(
        JSON.stringify({
          args,
          identities,
          computeEnv,
          gpu: options.mtpFitGpuIdentity,
          total: options.mtpFitGpuTotalMiB,
          maxTokens: options.maxTokens,
          textOnlyModel: options.textOnlyModel,
        }),
      )
      .digest("hex");
    return path.join(root, "mtp-fit-v1", `${key}.json`);
  } catch (_error) {
    // error-policy-allow: an optional cache must not prevent model startup.
    return null;
  }
}

/** @param {string} file */
async function fileIdentity(file) {
  const absolute = path.resolve(file);
  const info = await stat(absolute);
  if (!info.isFile())
    throw new Error("MTP cache requires a regular model/runtime file.");
  return [absolute, info.size, info.mtimeMs, info.ctimeMs];
}

/** @param {Options} options */
function validBudget(options) {
  const {
    mtpFitPhysicalFreeMiB: free,
    mtpFitMemoryGapMiB: gap,
    mtpFitGpuTotalMiB: total,
  } = options;
  return Boolean(
    typeof options.mtpFitGpuIdentity === "string" &&
    options.mtpFitGpuIdentity &&
    finiteNonnegative(free) &&
    finiteNonnegative(gap) &&
    finiteNonnegative(total) &&
    total > 0 &&
    free <= total &&
    gap <= total &&
    validTarget(Number(options.fitTargetMb), options),
  );
}

/** @param {unknown} value */
function finiteNonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** @param {number} value @param {Options} options */
function validTarget(value, options) {
  return (
    Number.isSafeInteger(value) &&
    value > 0 &&
    value < options.mtpFitGpuTotalMiB
  );
}

/** @param {string} file @param {Options} options @returns {Promise<Entry | null>} */
async function readEntry(file, options) {
  try {
    if ((await stat(file)).size > 4096) return null;
    const entry = JSON.parse(await readFile(file, "utf8"));
    return isReusableEntry(entry, options) ? entry : null;
  } catch (_error) {
    // error-policy-allow: missing, partial or corrupt cache data is a miss.
    return null;
  }
}

/** @param {Entry | null} entry @param {Options} options */
function isReusableEntry(entry, options) {
  if (!entry || !validTarget(entry.target, options)) return false;
  return (
    entry.target > Number(options.fitTargetMb) &&
    finiteNonnegative(entry.free) &&
    finiteNonnegative(entry.gap) &&
    finiteNonnegative(entry.savedAt) &&
    Date.now() >= entry.savedAt &&
    Date.now() - entry.savedAt <= MAX_AGE_MS &&
    Math.abs(entry.free - options.mtpFitPhysicalFreeMiB) <=
      MEMORY_TOLERANCE_MIB &&
    Math.abs(entry.gap - options.mtpFitMemoryGapMiB) <= MEMORY_TOLERANCE_MIB
  );
}

/** @param {string} file @param {Entry} entry */
async function saveEntry(file, entry) {
  try {
    await mkdir(path.dirname(file), { recursive: true });
    // This disposable hint has no authority over settings. Partial writes are
    // rejected on read; no shared settings/library storage or locking is needed.
    await writeFile(file, JSON.stringify(entry), "utf8");
  } catch (_error) {
    // error-policy-allow: read-only/full caches cannot break a healthy server.
  }
}

/** @param {string} file */
async function discardEntry(file) {
  try {
    await unlink(file);
  } catch (_error) {
    // error-policy-allow: cache removal is best effort, original error wins.
  }
}

module.exports = { prepareMtpFitCache };
