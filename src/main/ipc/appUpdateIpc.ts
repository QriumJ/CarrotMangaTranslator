import { prepareWindowsUpdate } from "./appUpdateInstallation";
import { app, BrowserWindow } from "electron";
import { appUpdateIpcContracts as contracts } from "../../shared/ipcAppUpdateContracts";
import { ipcEventContracts } from "../../shared/ipcEventContracts";
import { AppUpdateService } from "../application/appUpdateService";
import { AppUpdatePreparationCoordinator } from "../application/appUpdatePreparation";
import { findAppUpdate } from "../application/appUpdateRelease";
import { AppUpdateDownload } from "../appUpdateDownload";
import { getAppSettings, updateAppSettings } from "../settingsStore";
import { resolveBuildChannel } from "../buildChannel";
import { logError } from "../logger";
import type { IpcContext } from "./context";
import {
  registeredRendererHandleContract,
  trustedHandleContract,
} from "./trustedIpc";

export function registerAppUpdateIpc(context: IpcContext): void {
  const platform =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "macos"
        : "unsupported";
  const reportError = (error: unknown) =>
    logError("App update failed", { error });
  const download = new AppUpdateDownload(reportError);
  const preparation = new AppUpdatePreparationCoordinator();
  const windows = () =>
    BrowserWindow.getAllWindows().filter(
      (w) =>
        w === context.getMainWindow() ||
        context.panelWindows.isPanelSender(w.webContents.id),
    );
  const busy = () => context.jobs.gate.activities.length > 0;
  const service = new AppUpdateService(
    {
      currentVersion: app.getVersion(),
      platform,
      checkOnStartup: true,
      supported:
        app.isPackaged &&
        resolveBuildChannel() === "stable" &&
        ((platform === "windows" && process.arch === "x64") ||
          (platform === "macos" && process.arch === "arm64")),
    },
    {
      busy,
      reportError,
      emit: (state) => {
        for (const window of windows())
          window.webContents.send(
            ipcEventContracts.appUpdateState.channel,
            state,
          );
      },
      check: (signal) =>
        findAppUpdate(
          app.getVersion(),
          platform === "macos" ? "macos" : "windows",
          signal,
        ),
      download: (release, signal, progress) =>
        download.download(release, signal, progress),
      savePreference: async (enabled) => {
        await updateAppSettings((current) => ({
          ...current,
          ui: { ...current.ui, checkUpdatesOnStartup: enabled },
        }));
      },
      install: async (release) => {
        if (platform === "macos") return download.install(release);
        return prepareWindowsUpdate(
          context,
          download,
          preparation,
          windows,
          busy,
          release,
        );
      },
    },
  );
  bindUpdateCommands(context, service, preparation, reportError);
}

function bindUpdateCommands(
  context: IpcContext,
  service: AppUpdateService,
  preparation: AppUpdatePreparationCoordinator,
  reportError: (error: unknown) => void,
): void {
  let initialized: Promise<void> | null = null;
  const initialize = () =>
    (initialized ??= getAppSettings().then((settings) =>
      service.restorePreference(settings.ui?.checkUpdatesOnStartup !== false),
    ));
  registeredRendererHandleContract(
    context,
    contracts.getAppUpdateState,
    async () => {
      await initialize();
      return service.snapshot;
    },
  );
  trustedHandleContract(context, contracts.checkAppUpdate, () =>
    service.check(),
  );
  trustedHandleContract(context, contracts.downloadAppUpdate, () =>
    service.download(),
  );
  trustedHandleContract(context, contracts.cancelAppUpdate, () =>
    service.cancel(),
  );
  trustedHandleContract(context, contracts.installAppUpdate, () =>
    service.install(),
  );
  trustedHandleContract(
    context,
    contracts.setAppUpdateCheckOnStartup,
    (_event, enabled) => service.preference(enabled),
  );
  registeredRendererHandleContract(
    context,
    contracts.acknowledgeAppUpdate,
    (event, response) => preparation.acknowledge(event.sender.id, response),
  );
  context.jobs.gate.subscribe(() => service.refreshBusy());
  const timer = setTimeout(() => {
    if (!service.snapshot.supported) return;
    void initialize()
      .then(async () => {
        if (service.snapshot.checkOnStartup && service.snapshot.supported)
          await service.check();
      })
      .catch(reportError);
  }, 10_000);
  timer.unref();
  app.once("before-quit", () => {
    clearTimeout(timer);
    service.cancel();
  });
}
