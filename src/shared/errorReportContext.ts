import type { ErrorReportContext } from "./errorReportTypes";

export const ERROR_REPORT_CONTEXT_LIMITS = {
  summary: 1000,
  message: 16000,
  stack: 32000,
  componentStack: 32000,
  jobStage: 500,
  jobId: 200,
  executionId: 200,
  incidentAt: 100,
} as const;

/** Bound at producers; the IPC schema still rejects unknown/untrusted fields. */
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
