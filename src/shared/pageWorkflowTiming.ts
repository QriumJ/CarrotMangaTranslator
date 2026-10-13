import { z } from "zod";
import { PAGE_WORKFLOW_STAGES } from "./pageWorkflowStages";

const milliseconds = z.number().finite().nonnegative();
const stages = z.partialRecord(z.enum(PAGE_WORKFLOW_STAGES), milliseconds);
export const PageWorkflowTimingSchema = z
  .object({
    version: z.literal(1),
    attemptId: z.string().uuid(),
    runId: z.string().uuid(),
    startedAt: z.string(),
    finishedAt: z.string().optional(),
    status: z.enum([
      "running",
      "completed",
      "partial",
      "failed",
      "cancelled",
      "interrupted",
    ]),
    elapsedMs: milliseconds,
    stages,
    cleanupMs: milliseconds,
    chapters: z.array(
      z
        .object({ id: z.string(), title: z.string(), workId: z.string() })
        .strict(),
    ),
    pages: z.array(
      z
        .object({
          chapterId: z.string(),
          pageId: z.string(),
          pageName: z.string(),
          stages,
          skippedStages: z.array(z.enum(PAGE_WORKFLOW_STAGES)),
        })
        .strict(),
    ),
  })
  .strict();

export type PageWorkflowTiming = z.infer<typeof PageWorkflowTimingSchema>;
