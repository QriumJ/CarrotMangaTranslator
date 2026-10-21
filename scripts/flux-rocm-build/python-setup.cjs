/**
 * @typedef {{ line(text: string): void; raw(text: string): void; close(): void }} BuildLogger
 * @typedef {{ pythonDir: string; pythonExe: string; packageDir: string; downloadsDir: string; logger: BuildLogger }} PreparePythonOptions
 * @typedef {{ pythonExe: string; packageDir: string; runtimeDir: string; logger: BuildLogger }} InitializeRocmOptions
 */
const { mkdir, rm } = require("node:fs/promises");
const { basename, join } = require("node:path");
const { pythonUrl } = require("./config.cjs");
const {
  RUNTIME_INTEGRITY_MANIFEST,
} = require("../../src/main/runtime/runtime-integrity.cjs");
const {
  downloadHfFileWithProgress,
} = require("../../src/main/runtime/simple-page-download-utils.cjs");
const {
  MAX_REMOTE_SUPPORT_ASSET_BYTES,
} = require("../../src/main/runtime/transport/download-budgets.cjs");
const {
  downloadFile,
  ensureEmbeddedPythonPackagePath,
  extractZipSafely,
  run,
  sanitizeStandaloneEmbeddedPythonPathFile,
} = require("./process-utils.cjs");
const { isFile } = require("./windows-native-tools.cjs");

/**
 * @param {PreparePythonOptions} options
 * @returns {Promise<void>}
 */
async function prepareEmbeddedPython({
  pythonDir,
  pythonExe,
  packageDir,
  downloadsDir,
  logger,
}) {
  if (!isFile(pythonExe)) {
    await rm(pythonDir, { recursive: true, force: true });
    await mkdir(pythonDir, { recursive: true });
    const zipPath = join(downloadsDir, basename(new URL(pythonUrl).pathname));
    await downloadFile(pythonUrl, zipPath, logger);
    extractZipSafely(zipPath, pythonDir);
  }
  sanitizeStandaloneEmbeddedPythonPathFile(pythonDir);
  ensureEmbeddedPythonPackagePath(pythonExe, packageDir);
  const getPipPath = join(downloadsDir, "get-pip.py");
  const getPip = RUNTIME_INTEGRITY_MANIFEST.managedPython.getPip;
  await downloadHfFileWithProgress({
    label: "Flux ROCm build pip",
    file: "get-pip.py",
    url: getPip.url,
    destination: getPipPath,
    maximumBytes: MAX_REMOTE_SUPPORT_ASSET_BYTES,
    expectedSha256: getPip.sha256,
  });
  await run(pythonExe, [getPipPath], {
    env: {
      ...process.env,
      PYTHONNOUSERSITE: "1",
      PYTHONUTF8: "1",
      PYTHONUNBUFFERED: "1",
    },
    logger,
  });
}

module.exports = {
  prepareEmbeddedPython,
};
