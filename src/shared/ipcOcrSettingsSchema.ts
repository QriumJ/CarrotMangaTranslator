import { z } from "zod";
import { OCR_PIPELINES } from "./ocrEngines";
import {
  OcrGpuBackendSchema,
  OcrQualityModeSchema,
} from "./ipcSchemaPrimitives";

export const OcrSettingsSchema = z
  .object({
    hunyuan: z
      .object({
        model: z.enum(["auto", "f16", "q4"]),
        device: z.enum(["auto", "gpu", "cpu"]),
      })
      .strict()
      .optional(),
    pipeline: z.enum(OCR_PIPELINES).default("paddle-legacy"),
    device: z.enum(["cpu", "gpu"]),
    qualityMode: OcrQualityModeSchema,
    gpuCudaTag: z
      .string()
      .regex(/^cu\d+$/i)
      .optional(),
    gpuBackend: OcrGpuBackendSchema.optional(),
  })
  .strict();
