import type { BrowserWindow } from "electron";
import type { IpcContext } from "./context";
import type { AppUpdateDownload } from "../appUpdateDownload";
import type { AppUpdatePreparationCoordinator } from "../application/appUpdatePreparation";
import {
  AppUpdateError,
  type AppUpdateRelease,
} from "../application/appUpdateRelease";
import { ipcEventContracts } from "../../shared/ipcEventContracts";
import { libraryMutationCoordinator } from "../library";
import { suspendEnvironmentAccess } from "../environmentBackup/access";
import { disposeCachedInpaintingEngines } from "../inpainting/inpaintingEnginePool";
import { disposeTranslationRuntimeResources } from "../translationRuntime";

import { prepareAppUpdateInstallation } from "../application/appUpdateInstallation";

export async function prepareWindowsUpdate(
  context: IpcContext,
  download: AppUpdateDownload,
  preparation: AppUpdatePreparationCoordinator,
  windows: () => BrowserWindow[],
  busy: () => boolean,
  release: AppUpdateRelease,
): Promise<void> {
  const targets = windows();
  if (!targets.some((w) => w === context.getMainWindow()))
    throw new AppUpdateError("save", "Editor window is unavailable");
  await prepareAppUpdateInstallation({
    suspendWork: () => context.jobs.gate.suspendNewActivities().release,
    lockAndFlushEditors: () =>
      preparation.lockAndFlush(
        targets.map((window) => ({
          id: window.webContents.id,
          main: window === context.getMainWindow(),
          send: (request) => {
            if (window.isDestroyed() || window.webContents.isDestroyed()) {
              if (request.stage === "release") return;
              throw new Error("Editor closed");
            }
            window.webContents.send(
              ipcEventContracts.appUpdatePreparation.channel,
              request,
            );
          },
        })),
      ),
    assertReady: () => {
      if (busy())
        throw new AppUpdateError(
          "busy",
          "Work started during update preparation",
        );
      if (
        targets.some((w) => w.isDestroyed() || w.webContents.isDestroyed()) ||
        windows().some((w) => !targets.includes(w))
      )
        throw new AppUpdateError(
          "save",
          "Editor windows changed during preparation",
        );
    },
    drainAccess: suspendEnvironmentAccess,
    suspendMutations: () =>
      libraryMutationCoordinator.suspendNewMutations().release,
    drainMutations: () => libraryMutationCoordinator.waitForIdle(),
    disposeRuntimes: () =>
      Promise.all([
        disposeCachedInpaintingEngines("app-update"),
        disposeTranslationRuntimeResources("app-update"),
      ]),
    launch: () => download.install(release),
  });
}
