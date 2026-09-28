import { z } from "zod/v4";
import { McpSourceRectPatchSchema } from "./mcpSourceRect";
import {
  McpImageRouteInputSchema,
  McpTranslationQualityPolicySchema,
  McpTranslationSavedQualitySchema,
} from "./mcpTranslationQuality";

const { chapterId, pageId, revision } = McpSourceRectPatchSchema.shape;
export const McpTranslationGuideInputSchema = z
  .object({
    chapterId,
    pageIds: z
      .array(pageId)
      .min(1)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length)
      .optional(),
    imageCapabilities: McpImageRouteInputSchema.optional(),
  })
  .strict();
export const McpTranslationGuideOutputSchema = z
  .object({
    chapterId,
    workId: z.string(),
    previousChapterId: chapterId.nullable(),
    context: z
      .object({
        revision: z.string().nullable(),
        glossaryEntries: z.number().int().nonnegative(),
        characters: z.number().int().nonnegative(),
        memoryPages: z.number().int().nonnegative(),
        state: z.enum(["available", "unavailable"]),
      })
      .strict(),
    pages: z
      .array(
        z
          .object({
            pageId,
            revision,
            reviewRevision: revision,
            width: z.number(),
            height: z.number(),
            blocks: z.number().int().nonnegative(),
            explicitFonts: z.number().int().nonnegative(),
            savedQuality: McpTranslationSavedQualitySchema,
            requiresVisualSourceInspection: z.literal(true),
          })
          .strict(),
      )
      .max(50),
    qualityPolicy: McpTranslationQualityPolicySchema,
    maxReviewPasses: z.literal(3),
    imageRoute: z
      .object({
        route: z.string(),
        reason: z.string(),
        remainingAttempts: z.number().int().min(0).max(3),
      })
      .strict(),
    capabilityOrigin: z.literal(
      "mcp-tools-server-observed; image-capabilities-host-reported",
    ),
    availableTools: z.array(z.string()),
    missingTools: z.array(z.string()),
    steps: z.array(
      z
        .object({
          id: z.string(),
          instruction: z.string(),
          tools: z.array(z.string()),
        })
        .strict(),
    ),
    completionCriteria: z.array(z.string()),
    modelStarted: z.literal(false),
    qualityVerified: z.literal(false),
  })
  .strict();
