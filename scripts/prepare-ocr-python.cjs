const {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} = require("node:fs");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  RUNTIME_INTEGRITY_MANIFEST,
  resolvePinnedRemoteAsset,
} = require("../src/main/runtime/runtime-integrity.cjs");
const {
  downloadHfFileWithProgress,
} = require("../src/main/runtime/simple-page-download-utils.cjs");
const {
  MAX_REMOTE_RUNTIME_ARCHIVE_BYTES,
  MAX_REMOTE_SUPPORT_ASSET_BYTES,
} = require("../src/main/runtime/transport/download-budgets.cjs");

const root = join(__dirname, "..");
const managedPython = RUNTIME_INTEGRITY_MANIFEST.managedPython;
const pythonVersion =
  process.env.MANGA_TRANSLATOR_EMBED_PYTHON_VERSION || managedPython.version;
const pythonUrl =
  process.env.MANGA_TRANSLATOR_EMBED_PYTHON_URL ||
  `https://www.python.org/ftp/python/${pythonVersion}/python-${pythonVersion}-embed-amd64.zip`;
const getPipUrl =
  process.env.MANGA_TRANSLATOR_GET_PIP_URL || managedPython.getPip.url;
const toolsDir = join(root, "tools");
const pythonDir = join(toolsDir, "python");
const tmpDir = join(root, ".tmp", "ocr-python");
const pythonExe = join(pythonDir, "python.exe");

async function main() {
  if (process.platform !== "win32") {
    console.log(
      "[ocr-python] skipping embedded Python download on non-Windows host",
    );
    return;
  }

  if (existsSync(pythonExe)) {
    sanitizePythonPathFile(pythonDir);
    console.log(`[ocr-python] already prepared: ${pythonExe}`);
    return;
  }

  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(pythonDir, { recursive: true });

  const zipPath = join(tmpDir, "python-embed-amd64.zip");
  const getPipPath = join(tmpDir, "get-pip.py");
  const pythonAsset = resolvePinnedRemoteAsset({
    defaultUrl: managedPython.archive.url,
    defaultSha256: managedPython.archive.sha256,
    url: pythonUrl,
    overrideSha256: process.env.MANGA_TRANSLATOR_EMBED_PYTHON_SHA256,
    label: "OCR build Python",
  });
  await downloadHfFileWithProgress({
    label: "OCR build Python",
    file: "python-embed-amd64.zip",
    url: pythonAsset.url,
    destination: zipPath,
    maximumBytes: MAX_REMOTE_RUNTIME_ARCHIVE_BYTES,
    expectedSha256: pythonAsset.sha256,
  });
  expandArchive(zipPath, pythonDir);
  sanitizePythonPathFile(pythonDir);
  const pipAsset = resolvePinnedRemoteAsset({
    defaultUrl: managedPython.getPip.url,
    defaultSha256: managedPython.getPip.sha256,
    url: getPipUrl,
    overrideSha256: process.env.MANGA_TRANSLATOR_GET_PIP_SHA256,
    label: "OCR build pip",
  });
  await downloadHfFileWithProgress({
    label: "OCR build pip",
    file: "get-pip.py",
    url: pipAsset.url,
    destination: getPipPath,
    maximumBytes: MAX_REMOTE_SUPPORT_ASSET_BYTES,
    expectedSha256: pipAsset.sha256,
  });
  run(pythonExe, [getPipPath, "--no-warn-script-location"]);
  console.log(`[ocr-python] prepared: ${pythonExe}`);
}

/**
 * @param {string} zipPath
 * @param {string} outputDir
 */
function expandArchive(zipPath, outputDir) {
  run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(outputDir)} -Force`,
  ]);
}

/** @param {string} outputDir */
function sanitizePythonPathFile(outputDir) {
  const pthName = readdirSync(outputDir).find((name) =>
    /^python\d+._pth$/i.test(name),
  );
  if (!pthName) {
    return;
  }

  const pthPath = join(outputDir, pthName);
  const text = readFileSync(pthPath, "utf8");
  const lines = text.split(/\r?\n/);
  const sanitized = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "#import site" || trimmed === "import site") {
      continue;
    }
    if (isManagedOcrPackagePath(trimmed)) {
      continue;
    }
    if (!trimmed && sanitized[sanitized.length - 1] === "") {
      continue;
    }
    sanitized.push(line);
  }

  while (sanitized.length > 0 && sanitized[sanitized.length - 1] === "") {
    sanitized.pop();
  }
  if (sanitized.length > 0) {
    sanitized.push("");
  }
  sanitized.push("import site");

  const nextText = `${sanitized.join("\n")}\n`;
  if (nextText !== text) {
    writeFileSync(pthPath, nextText, "utf8");
  }
}

/** @param {string} line */
function isManagedOcrPackagePath(line) {
  if (!line || line.startsWith("#")) {
    return false;
  }

  const normalized = line.replace(/\\/g, "/").toLowerCase();
  const basename = normalized.split("/").pop() || "";
  return (
    basename.startsWith("python-packages") ||
    normalized.includes("/manga-gemma-translator/ocr-runtime/") ||
    normalized.includes("/mgt-ocr-runtime/") ||
    normalized.includes("/.tmp/ocr-runtime/")
  );
}

/**
 * @param {string} command
 * @param {string[]} args
 */
function run(command, args) {
  console.log(`> ${command} ${args.join(" ")}`);
  const env = { ...process.env };
  delete env.PYTHONHOME;
  delete env.PYTHONPATH;
  delete env.PYTHONUSERBASE;
  const result = spawnSync(command, args, {
    cwd: root,
    env: {
      ...env,
      PYTHONNOUSERSITE: "1",
      PYTHONUTF8: "1",
      PYTHONUNBUFFERED: "1",
    },
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed with exit code ${result.status ?? "null"}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
