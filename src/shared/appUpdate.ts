import { z } from "zod";

export const AppUpdateStateSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    currentVersion: z.string().max(64),
    platform: z.enum(["windows", "macos", "unsupported"]),
    supported: z.boolean(),
    checkOnStartup: z.boolean(),
    phase: z.enum([
      "idle",
      "checking",
      "current",
      "available",
      "downloading",
      "ready",
      "preparing",
      "installing",
      "error",
    ]),
    version: z.string().max(64).optional(),
    transferred: z.number().nonnegative().optional(),
    total: z.number().nonnegative().optional(),
    busy: z.boolean(),
    error: z
      .enum([
        "network",
        "incomplete",
        "integrity",
        "download",
        "storage",
        "save",
        "busy",
        "install",
        "unsupported",
      ])
      .optional(),
    errorStage: z.enum(["check", "download", "install"]).optional(),
  })
  .strict();

export type AppUpdateState = z.infer<typeof AppUpdateStateSchema>;
export const AppUpdatePreparationSchema = z
  .object({
    id: z.string().uuid(),
    stage: z.enum(["lock", "flush", "release"]),
  })
  .strict();
export type AppUpdatePreparation = z.infer<typeof AppUpdatePreparationSchema>;
export const AppUpdateAcknowledgementSchema = z
  .object({
    id: z.string().uuid(),
    stage: z.enum(["lock", "flush"]),
    error: z.string().max(500).optional(),
  })
  .strict();
export type AppUpdateAcknowledgement = z.infer<
  typeof AppUpdateAcknowledgementSchema
>;
