import { z } from "zod";
import { defineIpcContract } from "./ipcContractCore";
import { uuid } from "./ipcSchemaPrimitives";

export const retouchIpcContracts = {
  cancelInpaintingRetouch: defineIpcContract<[string | null], void>({
    apiKey: "cancelInpaintingRetouch",
    channel: "inpainting:cancel-retouch",
    args: z.tuple([uuid.nullable()]),
    result: z.void(),
  }),
};
