import { app, shell } from "electron";
import { join } from "node:path";
import { lstat } from "node:fs/promises";
import { AppUpdateWindows } from "./appUpdateWindows";
import { downloadToFile } from "./runtimeSupport/modelDownloads";
import { sha256File } from "./runtimeSupport/fileProbe";
import {
  AppUpdateError,
  type AppUpdateRelease,
} from "./application/appUpdateRelease";

async function verifyAppUpdateFile(
  path: string,
  release: AppUpdateRelease,
): Promise<void> {
  const info = await lstat(path).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new AppUpdateError("integrity", "Downloaded installer is missing");
    throw error;
  });
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size !== release.size ||
    (await sha256File(path)) !== release.sha256
  ) {
    throw new AppUpdateError(
      "integrity",
      "Update file size or checksum mismatch",
    );
  }
}

export class AppUpdateDownload {
  private windows: AppUpdateWindows | null = null;
  private path: string | null = null;
  constructor(
    private readonly reportError: (error: unknown) => void,
    private readonly createWindows = (url: string) =>
      new AppUpdateWindows({ provider: "generic", url }),
  ) {}

  async download(
    release: AppUpdateRelease,
    signal: AbortSignal,
    progress: (bytes: number) => void,
  ): Promise<void> {
    this.path = null;
    let path: string;
    try {
      path =
        process.platform === "win32"
          ? await this.downloadWindows(release, signal, progress)
          : await this.downloadMac(release, signal, progress);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (["ENOSPC", "EACCES", "EPERM", "EROFS"].includes(code ?? ""))
        throw new AppUpdateError("storage", String(error));
      if (
        /checksum|sha256|sha512|크기 검증|해시 검증|size mismatch/i.test(
          String(error),
        )
      )
        throw new AppUpdateError("integrity", String(error));
      throw error;
    }
    signal.throwIfAborted();
    await verifyAppUpdateFile(path, release);
    this.path = path;
  }
  async install(release: AppUpdateRelease): Promise<void> {
    if (!this.path)
      throw new AppUpdateError("install", "No verified update is available");
    await verifyAppUpdateFile(this.path, release);
    if (process.platform === "darwin") {
      const error = await shell.openPath(this.path);
      if (error) throw new AppUpdateError("install", error);
    } else {
      if (!this.windows)
        throw new AppUpdateError("install", "Updater is not initialized");
      await this.windows.installAfterSaving();
    }
  }
  private async downloadWindows(
    release: AppUpdateRelease,
    signal: AbortSignal,
    progress: (bytes: number) => void,
  ): Promise<string> {
    const updater = this.createWindows(release.baseUrl);
    this.windows = updater;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.disableDifferentialDownload = true;
    updater.disableWebInstaller = true;
    updater.on("error", this.reportError);
    updater.on("download-progress", (info) => progress(info.transferred));
    const result = await waitForUpdateCheck(updater.checkForUpdates(), signal);
    if (
      !result ||
      result.updateInfo.version !== release.version ||
      result.updateInfo.files.length !== 1 ||
      !result.updateInfo.files.some(
        (f) => f.url === release.name && f.size === release.size,
      )
    ) {
      throw new AppUpdateError(
        "integrity",
        "Update metadata does not match the release",
      );
    }
    const token = result.cancellationToken;
    if (!token)
      throw new AppUpdateError("install", "No update download session");
    const cancel = () => token.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      signal.throwIfAborted();
      const paths = await updater.downloadUpdate(token);
      if (paths.length !== 1)
        throw new AppUpdateError("integrity", "Expected one update installer");
      return paths[0];
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  }
  private async downloadMac(
    release: AppUpdateRelease,
    signal: AbortSignal,
    progress: (bytes: number) => void,
  ): Promise<string> {
    const outputPath = join(
      app.getPath("userData"),
      "app-updates",
      release.version,
      release.name,
    );
    await downloadToFile({
      url: release.url,
      outputPath,
      signal,
      label: "App update",
      progressText: "App update",
      expectedSha256: release.sha256,
      expectedTotalBytes: release.size,
      maximumBytes: release.size,
      onProgress: (event) => progress(event.progressBytes ?? 0),
    });
    return outputPath;
  }
}

/** Stable updater checks have no public abort API; abandon only the check, never start its download. */
async function waitForUpdateCheck<T>(
  task: Promise<T>,
  parent: AbortSignal,
): Promise<T> {
  const signal = AbortSignal.any([parent, AbortSignal.timeout(15_000)]);
  let onAbort: (() => void) | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      void task.then(resolve, reject);
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}
