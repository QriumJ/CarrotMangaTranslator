import { z } from "zod";

// Only repeatable output preferences; selection and destructive options are per-run.
export const ExportPreferencesSchema = z
  .object({
    outputFormat: z.enum(["source", "png", "jpeg", "webp"]),
    jpegQuality: z.number().int().min(1).max(100),
    webpQuality: z.number().int().min(1).max(100),
    preserveSourceNames: z.boolean(),
    destinationMode: z.enum(["timestamped", "fixed"]),
  })
  .strict();

export type ExportPreferences = z.infer<typeof ExportPreferencesSchema>;

export const DEFAULT_EXPORT_PREFERENCES: ExportPreferences = {
  outputFormat: "source",
  jpegQuality: 95,
  webpQuality: 90,
  preserveSourceNames: true,
  destinationMode: "timestamped",
};

export function normalizeExportPreferences(value: unknown): ExportPreferences {
  const source =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const fallback = DEFAULT_EXPORT_PREFERENCES;
  return {
    outputFormat:
      ExportPreferencesSchema.shape.outputFormat.safeParse(source.outputFormat)
        .data ?? fallback.outputFormat,
    jpegQuality:
      ExportPreferencesSchema.shape.jpegQuality.safeParse(source.jpegQuality)
        .data ?? fallback.jpegQuality,
    webpQuality:
      ExportPreferencesSchema.shape.webpQuality.safeParse(source.webpQuality)
        .data ?? fallback.webpQuality,
    preserveSourceNames:
      typeof source.preserveSourceNames === "boolean"
        ? source.preserveSourceNames
        : fallback.preserveSourceNames,
    destinationMode:
      source.destinationMode === "fixed" ? "fixed" : "timestamped",
  };
}
