import type { TFunction } from "i18next";
import { appUpdateGateway as gateway } from "../api/appUpdateGateway";
import { receiveAppUpdate } from "./appUpdateStore";
import { toast } from "./toastStore";
import type { AppCommandMap } from "./appCommandTypes";
import type { AppUpdateState } from "../../../shared/appUpdate";

export function createAppUpdateCommands(
  t: TFunction<"components">,
  platform?: AppUpdateState["platform"],
): Pick<
  AppCommandMap,
  | "check-app-update"
  | "download-app-update"
  | "cancel-app-update"
  | "install-app-update"
> {
  const run = (action: () => Promise<AppUpdateState>) => {
    void action()
      .then(receiveAppUpdate)
      .catch(() => toast.error(t("settings.update.errors.network")));
  };
  return {
    "check-app-update": {
      id: "check-app-update",
      label: t("settings.update.check"),
      paletteVisible: false,
      run: () => run(() => gateway.checkAppUpdate()),
    },
    "download-app-update": {
      id: "download-app-update",
      label: t("settings.update.download"),
      paletteVisible: false,
      run: () => run(() => gateway.downloadAppUpdate()),
    },
    "cancel-app-update": {
      id: "cancel-app-update",
      label: t("settings.update.cancel"),
      paletteVisible: false,
      run: () => run(() => gateway.cancelAppUpdate()),
    },
    "install-app-update": {
      id: "install-app-update",
      label: t(
        platform === "macos"
          ? "settings.update.openInstaller"
          : "settings.update.install",
      ),
      paletteVisible: false,
      run: () => run(() => gateway.installAppUpdate()),
    },
  };
}
