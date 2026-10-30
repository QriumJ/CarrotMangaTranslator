import { createMangaDomainGateway } from "./mangaGateway";
export const appUpdateGateway = createMangaDomainGateway("App update", [
  "getAppUpdateState",
  "checkAppUpdate",
  "downloadAppUpdate",
  "cancelAppUpdate",
  "installAppUpdate",
  "setAppUpdateCheckOnStartup",
  "acknowledgeAppUpdate",
  "onAppUpdateState",
  "onAppUpdatePreparation",
] as const);
