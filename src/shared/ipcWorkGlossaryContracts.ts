import { z } from "zod";
import {
  MAX_WORK_GLOSSARY_FILE_BYTES,
  type WorkGlossaryFileOpenResult,
} from "./workGlossaryFile";
import { defineIpcContract, localPathResult } from "./ipcContractCore";

/** OS file dialogs for the portable term file; the renderer owns parsing. */
export const workGlossaryIpcContracts = {
  openWorkGlossaryFile: defineIpcContract<[], WorkGlossaryFileOpenResult>({
    apiKey: "openWorkGlossaryFile",
    channel: "context:open-work-glossary-file",
    args: z.tuple([]),
    result: z
      .union([
        z
          .object({
            path: localPathResult,
            content: z.string().max(MAX_WORK_GLOSSARY_FILE_BYTES),
          })
          .strict(),
        z.object({ path: localPathResult, tooLarge: z.literal(true) }).strict(),
      ])
      .nullable(),
  }),
  saveWorkGlossaryFile: defineIpcContract<
    [{ defaultName: string; content: string }],
    { saved: true; path: string } | null
  >({
    apiKey: "saveWorkGlossaryFile",
    channel: "context:save-work-glossary-file",
    args: z.tuple([
      z
        .object({
          defaultName: z.string().trim().min(1).max(200),
          content: z.string().min(1).max(MAX_WORK_GLOSSARY_FILE_BYTES),
        })
        .strict(),
    ]),
    result: z
      .object({ saved: z.literal(true), path: localPathResult })
      .strict()
      .nullable(),
  }),
} as const;
