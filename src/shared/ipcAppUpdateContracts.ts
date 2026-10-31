import { z } from "zod";
import { defineIpcContract } from "./ipcContractCore";
import {
  AppUpdateStateSchema,
  AppUpdateAcknowledgementSchema,
  type AppUpdateState,
  type AppUpdateAcknowledgement,
} from "./appUpdate";

export const appUpdateIpcContracts = {
  getAppUpdateState: defineIpcContract<[], AppUpdateState>({
    apiKey: "getAppUpdateState",
    channel: "app-update:get",
    args: z.tuple([]),
    result: AppUpdateStateSchema,
  }),
  checkAppUpdate: defineIpcContract<[], AppUpdateState>({
    apiKey: "checkAppUpdate",
    channel: "app-update:check",
    args: z.tuple([]),
    result: AppUpdateStateSchema,
  }),
  downloadAppUpdate: defineIpcContract<[], AppUpdateState>({
    apiKey: "downloadAppUpdate",
    channel: "app-update:download",
    args: z.tuple([]),
    result: AppUpdateStateSchema,
  }),
  cancelAppUpdate: defineIpcContract<[], AppUpdateState>({
    apiKey: "cancelAppUpdate",
    channel: "app-update:cancel",
    args: z.tuple([]),
    result: AppUpdateStateSchema,
  }),
  installAppUpdate: defineIpcContract<[], AppUpdateState>({
    apiKey: "installAppUpdate",
    channel: "app-update:install",
    args: z.tuple([]),
    result: AppUpdateStateSchema,
  }),
  setAppUpdateCheckOnStartup: defineIpcContract<[boolean], AppUpdateState>({
    apiKey: "setAppUpdateCheckOnStartup",
    channel: "app-update:preference",
    args: z.tuple([z.boolean()]),
    result: AppUpdateStateSchema,
  }),
  acknowledgeAppUpdate: defineIpcContract<[AppUpdateAcknowledgement], boolean>({
    apiKey: "acknowledgeAppUpdate",
    channel: "app-update:acknowledge",
    args: z.tuple([AppUpdateAcknowledgementSchema]),
    result: z.boolean(),
  }),
} as const;
