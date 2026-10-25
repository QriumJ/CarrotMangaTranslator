import type { ErrorReportContext } from "./errorReportTypes";

export const ERROR_REPORT_CONTEXT_LIMITS = {
  summary: 1000,
  message: Number.POSITIVE_INFINITY,
  stack: Number.POSITIVE_INFINITY,
  componentStack: Number.POSITIVE_INFINITY,
  jobStage: 500,
  jobId: 200,
  executionId: 200,
  incidentAt: 100,
} as const;

/** Bound display metadata, never incident evidence. IPC still rejects unknown fields. */
export function normalizeErrorReportContext(
  context: ErrorReportContext,
): ErrorReportContext {
  const result: ErrorReportContext = { source: context.source };
  for (const key of Object.keys(ERROR_REPORT_CONTEXT_LIMITS) as Array<
    keyof typeof ERROR_REPORT_CONTEXT_LIMITS
  >) {
    const value = context[key];
    if (value !== undefined) {
      const limit = ERROR_REPORT_CONTEXT_LIMITS[key];
      result[key] =
        value.length <= limit
          ? value
          : `${value.slice(0, limit - 1).replace(/[\uD800-\uDBFF]$/, "")}…`;
    }
  }
  return result;
}
