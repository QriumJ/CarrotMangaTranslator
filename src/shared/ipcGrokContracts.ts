import { z } from "zod";
import { defineIpcContract } from "./ipcContractCore";
import type { GrokAccount } from "./grokTypes";

const account = z
  .object({
    authenticated: z.boolean(),
    runtimeInstalled: z.boolean(),
    version: z.string(),
    models: z.array(
      z
        .object({
          id: z.string(),
          displayName: z.string(),
          supportedReasoningEfforts: z.array(z.string()),
          defaultReasoningEffort: z.string(),
          isDefault: z.boolean(),
        })
        .strict(),
    ),
  })
  .strict();

export const grokIpcContracts = {
  getGrokAccount: defineIpcContract<[], GrokAccount>({
    apiKey: "getGrokAccount",
    channel: "grok:account",
    args: z.tuple([]),
    result: account,
  }),
  loginGrokAccount: defineIpcContract<[], GrokAccount>({
    apiKey: "loginGrokAccount",
    channel: "grok:login",
    args: z.tuple([]),
    result: account,
  }),
  logoutGrokAccount: defineIpcContract<[], GrokAccount>({
    apiKey: "logoutGrokAccount",
    channel: "grok:logout",
    args: z.tuple([]),
    result: account,
  }),
};
