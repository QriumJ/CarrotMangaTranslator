import { z } from "zod";

export const GitHubReportAuthActionSchema = z.enum([
  "status",
  "start",
  "poll",
  "reopen",
  "disconnect",
]);
export const GitHubReportAuthStateSchema = z
  .object({
    configured: z.boolean(),
    login: z.string().optional(),
    userCode: z.string().optional(),
    expiresAt: z.number().optional(),
  })
  .strict();
export const SubmitGitHubReportSchema = z
  .object({
    reportId: z.string().uuid(),
    title: z.string().trim().min(1).max(240),
    description: z.string().max(1000),
    includeSystem: z.boolean(),
    includeLogs: z.boolean(),
  })
  .strict();
export const GitHubReportResultSchema = z
  .object({
    issueUrl: z.string().url(),
    opened: z.boolean(),
  })
  .strict();
export type GitHubReportAuthAction = z.infer<
  typeof GitHubReportAuthActionSchema
>;
export type GitHubReportAuthState = z.infer<typeof GitHubReportAuthStateSchema>;
export type SubmitGitHubReport = z.infer<typeof SubmitGitHubReportSchema>;
export type GitHubReportResult = z.infer<typeof GitHubReportResultSchema>;
