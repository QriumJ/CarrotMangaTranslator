import type {
  ErrorReportContext,
  ErrorReportDraft,
} from "../shared/errorReportTypes";
import { ERROR_REPORT_LOG_MAX_BYTES } from "../shared/errorReportTypes";
import { redactDiagnosticText } from "./errorReportRedaction";
import {
  readRecentDiagnosticLogEntries,
  renderLogMarkdown,
  truncateUtf8,
} from "./errorReportLogs";
import { resolveBuildChannel } from "./buildChannel";
import { captureReportSnapshot } from "./errorReportSnapshot";
import {
  collectErrorReportEnvironment,
  buildSystemMarkdown,
  type ErrorReportBuildEnvironment,
} from "./errorReportEnvironment";

const ERROR_SECTION_MAX_BYTES = 32 * 1024;
const SYSTEM_SECTION_MAX_BYTES = 4 * 1024;
const ERROR_REPORT_DRAFT_MAX_BYTES = 54 * 1024;

export async function prepareErrorReportDraft(
  ...args: Parameters<typeof collectErrorReportEnvironment>
): Promise<ErrorReportDraft> {
  const environment = await collectErrorReportEnvironment(...args);
  const snapshot = await captureReportSnapshot(args[0], environment);
  return {
    ...(await buildErrorReportDraft(args[0], environment)),
    reportId: snapshot.id,
    fullLogBytes: snapshot.parts
      .filter((part) => part.kind === "current" || part.kind === "previous")
      .reduce((total, part) => total + part.bytes, 0),
  };
}

export async function buildErrorReportDraft(
  context: ErrorReportContext,
  environment: ErrorReportBuildEnvironment,
): Promise<ErrorReportDraft> {
  const redactionOptions = {
    appPaths: environment.appPaths,
    homeDir: environment.homeDir,
  };
  let redactionCount = 0;

  const redact = (text: string) => {
    const result = redactDiagnosticText(text, redactionOptions);
    redactionCount += result.redactionCount;
    return result.text;
  };
  const safeContext = Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      typeof value === "string" ? redact(value) : value,
    ]),
  ) as ErrorReportContext;
  const errorRedaction = {
    text: buildErrorMarkdown(
      safeContext,
      environment.executionDiagnostics
        ? redact(JSON.stringify(environment.executionDiagnostics))
        : undefined,
    ),
  };
  const boundedError = truncateUtf8(
    errorRedaction.text,
    ERROR_SECTION_MAX_BYTES,
  );

  const systemRedaction = { text: redact(buildSystemMarkdown(environment)) };
  const boundedSystem = truncateUtf8(
    systemRedaction.text,
    SYSTEM_SECTION_MAX_BYTES,
  );

  const collection = await readRecentDiagnosticLogEntries(
    environment.previousLogPath,
    environment.currentLogPath,
    context.executionId,
    context.jobId,
  );
  const redactedLogEntries = collection.entries.map((entry) => ({
    ...entry,
    line: redact(entry.line),
  }));
  const bytesRemaining =
    ERROR_REPORT_DRAFT_MAX_BYTES -
    utf8ByteLength(boundedError.text) -
    utf8ByteLength(boundedSystem.text);
  const renderedLogs = renderLogMarkdown(
    redactedLogEntries,
    Math.min(ERROR_REPORT_LOG_MAX_BYTES, Math.max(bytesRemaining, 0)),
    collection.omitted,
  );

  return {
    defaultTitle: defaultTitleForSource(
      context.source,
      environment.platform === "darwin" &&
        environment.arch === "arm64" &&
        (environment.buildChannel ??
          resolveBuildChannel(environment.platform, environment.arch)) ===
          "mac-alpha",
    ),
    errorMarkdown: boundedError.text,
    systemMarkdown: boundedSystem.text,
    logsMarkdown: renderedLogs.text,
    redactionCount,
    truncated:
      boundedError.truncated ||
      boundedSystem.truncated ||
      collection.omitted > 0 ||
      renderedLogs.truncated,
  };
}

function buildErrorMarkdown(
  context: ErrorReportContext,
  executionDiagnostics?: unknown,
): string {
  const lines = ["## Error", "", `- Source: \`${context.source}\``];
  appendOptionalListItem(lines, "Summary", context.summary);
  appendOptionalListItem(lines, "Job stage", context.jobStage, true);
  appendOptionalListItem(lines, "Job ID", context.jobId, true);
  appendOptionalListItem(lines, "Execution ID", context.executionId, true);
  appendOptionalListItem(lines, "Incident time", context.incidentAt, true);
  appendOptionalCodeSection(lines, "Message", context.message);
  appendOptionalCodeSection(lines, "Stack", context.stack);
  appendOptionalCodeSection(
    lines,
    "React component stack",
    context.componentStack,
  );
  if (executionDiagnostics)
    appendOptionalCodeSection(
      lines,
      "Execution diagnostics",
      String(executionDiagnostics),
    );
  const hasDetails = [
    context.summary,
    context.message,
    context.stack,
    context.componentStack,
  ].some(hasText);
  if (!hasDetails) {
    lines.push("", "_No exception details were supplied._");
  }
  return lines.join("\n");
}

function defaultTitleForSource(
  source: ErrorReportContext["source"],
  macAlpha: boolean,
): string {
  const prefix = macAlpha ? "[macOS Alpha] " : "";
  switch (source) {
    case "manual":
      return `${prefix}[Bug] Problem report`;
    case "job-failure":
      return `${prefix}[Bug] Translation or processing job failed`;
    case "react-boundary":
      return `${prefix}[Bug] Renderer component crashed`;
    case "renderer-global":
      return `${prefix}[Bug] Unexpected renderer error`;
    case "main-process":
      return `${prefix}[Bug] Main process error`;
    case "renderer-process":
      return `${prefix}[Bug] Renderer process crashed`;
  }
}

function fencedText(value: string): string {
  return `\`\`\`text\n${value.replace(/```/g, "` ` `")}\n\`\`\``;
}

function appendOptionalListItem(
  lines: string[],
  label: string,
  value: string | undefined,
  code = false,
): void {
  if (!hasText(value)) {
    return;
  }
  const normalized = singleLine(value);
  lines.push(`- ${label}: ${code ? `\`${normalized}\`` : normalized}`);
}

function appendOptionalCodeSection(
  lines: string[],
  title: string,
  value: string | undefined,
): void {
  if (hasText(value)) {
    lines.push("", `### ${title}`, "", fencedText(value));
  }
}

function hasText(value: string | undefined): value is string {
  return Boolean(value?.trim());
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
