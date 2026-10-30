import { app, autoUpdater } from "electron";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { NsisUpdater } from "electron-updater";
import { AppUpdateError } from "./application/appUpdateRelease";

/** Unlike quitAndInstall in 6.8.11, wait for launch/UAC acceptance before quitting. */
export class AppUpdateWindows extends NsisUpdater {
  private launch: Promise<void> | null = null;

  async installAfterSaving(): Promise<void> {
    if (!this.install(true, true) || !this.launch) {
      this.quitAndInstallCalled = false;
      throw new AppUpdateError("install", "Installer could not be started");
    }
    try {
      await this.launch;
    } catch (error) {
      this.quitAndInstallCalled = false;
      throw error;
    }
    setImmediate(() => {
      autoUpdater.emit("before-quit-for-update");
      app.quit();
    });
  }

  protected override doInstall(): boolean {
    const installer = this.installerPath;
    if (!installer) return false;
    this.launch = launchWindowsUpdate(installer);
    return true;
  }
}

async function launchWindowsUpdate(installer: string): Promise<void> {
  // build/installer.nsh requests admin even for per-user installs. Always wait
  // for the helper's UAC result; metadata does not encode this custom manifest.
  // Without -w, elevate exits after ShellExecute/UAC, not after installation.
  await startInstaller(join(process.resourcesPath, "elevate.exe"), [
    installer,
    "/S",
    "--updated",
    "--force-run",
  ]);
}

function startInstaller(file: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);

    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new AppUpdateError(
              "install",
              `Elevation declined or failed (${code})`,
            ),
          ),
    );
    child.unref();
  });
}
