import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { ERROR_REPORT_MAX_LOG_ENTRIES } from "../shared/errorReportTypes";

export type DiagnosticLogEntry = {
  source: "current" | "previous";
  line: string;
};

export type DiagnosticLogCollection = {
  entries: DiagnosticLogEntry[];
  omitted: number;
};

export async function readRecentDiagnosticLogEntries(
  previousLogPath: string,
  currentLogPath: string,
  executionId?: string,
): Promise<DiagnosticLogCollection> {
  const buckets: DiagnosticLogEntry[][] = [[], [], [], []];
  let count = 0;
  const append = (entry: DiagnosticLogEntry) => {
    const related = Boolean(
      executionId && entry.line.includes(JSON.stringify(executionId)),
    );
    const priority =
      (/\[(?:WARN|ERROR)\]/.test(entry.line) ? 2 : 0) + (related ? 1 : 0);
    const bucket = buckets[priority];
    count += 1;
    bucket.push(entry);
    if (bucket.length > ERROR_REPORT_MAX_LOG_ENTRIES) bucket.shift();
  };
  await appendDiagnosticLogEntries(append, previousLogPath, "previous");
  await appendDiagnosticLogEntries(append, currentLogPath, "current");
  const limits = [25, 50, 50, 75].map((limit, index) =>
    Math.min(limit, buckets[index].length),
  );
  let remaining =
    ERROR_REPORT_MAX_LOG_ENTRIES -
    limits.reduce((sum, limit) => sum + limit, 0);
  for (let index = buckets.length - 1; index >= 0; index -= 1) {
    const extra = Math.min(remaining, buckets[index].length - limits[index]);
    limits[index] += extra;
    remaining -= extra;
  }
  const entries = buckets.flatMap((bucket, index) =>
    limits[index] ? bucket.slice(-limits[index]) : [],
  );
  return { entries, omitted: count - entries.length };
}

async function appendDiagnosticLogEntries(
  append: (entry: DiagnosticLogEntry) => void,
  logPath: string,
  source: DiagnosticLogEntry["source"],
): Promise<void> {
  const input = createReadStream(logPath, { encoding: "utf8" });
  const lines = createInterface({
    input,
    crlfDelay: Infinity,
  });
  try {
    for await (const rawLine of lines) {
      const line = rawLine.replace(/^\ufeff/, "");
      if (
        /\[(?:WARN|ERROR)\]/.test(line) ||
        /\[INFO\].*(?:job:|Job execution|workflow|Workflow|runtime cleanup)/.test(
          line,
        )
      )
        append({ source, line });
    }
  } catch (error) {
    if (!isMissingFileError(error))
      append({
        source,
        line: `[diagnostic] Failed to read ${source} app log (${errorCode(error)}).`,
      });
  } finally {
    lines.close();
    input.destroy();
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String(error.code);
  }
  return "UNKNOWN";
}

const TRUNCATION_MARKER = "\n\n_… diagnostic content truncated …_\n";

export function truncateUtf8(
  value: string,
  maxBytes: number,
): { text: string; truncated: boolean } {
  if (utf8ByteLength(value) <= maxBytes) {
    return { text: value, truncated: false };
  }
  if (maxBytes <= 0) {
    return { text: "", truncated: true };
  }
  const markerBytes = Buffer.byteLength(TRUNCATION_MARKER);
  if (maxBytes <= markerBytes) {
    return {
      text: utf8Prefix(TRUNCATION_MARKER, maxBytes),
      truncated: true,
    };
  }
  return {
    text: `${utf8Prefix(value, maxBytes - markerBytes)}${TRUNCATION_MARKER}`,
    truncated: true,
  };
}

function utf8Prefix(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value);
  let end = Math.min(bytes.length, Math.max(0, maxBytes));
  while (end > 0 && end < bytes.length && (bytes[end] & 0xc0) === 0x80)
    end -= 1;
  return bytes.subarray(0, end).toString("utf8");
}

function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function renderLogMarkdown(
  entries: DiagnosticLogEntry[],
  maxBytes: number,
  omittedCount = 0,
): { text: string; truncated: boolean } {
  if (!entries.length)
    return truncateUtf8(
      "## Recent diagnostic logs\n\n_No diagnostic entries were found in the current or previous app log._",
      maxBytes,
    );
  const prefix = `## Recent diagnostic logs\n\nCollection omitted: ${omittedCount} entries. Current/previous identify app sessions; entries are prioritized by execution, severity, then recency.\n\n\`\`\`text\n`;
  const suffix = "\n```";
  const omission = "[entries omitted or shortened]\n";
  const selected: string[] = [];
  let omitted = omittedCount > 0;
  const entryBudget = Math.max(
    0,
    Math.min(8 * 1024, maxBytes - utf8ByteLength(prefix + suffix + omission)),
  );
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const bounded = truncateUtf8(
      `[${entry.source}] ${entry.line.replace(/```/g, "` ` `")}`,
      entryBudget,
    );
    omitted ||= bounded.truncated;
    const candidate = `${prefix}${omission}${[bounded.text, ...selected].join("\n")}${suffix}`;
    if (utf8ByteLength(candidate) > maxBytes) {
      omitted = true;
      continue;
    }
    selected.unshift(bounded.text);
  }
  const result = truncateUtf8(
    `${prefix}${omitted ? omission : ""}${selected.join("\n")}${suffix}`,
    maxBytes,
  );
  return { text: result.text, truncated: omitted || result.truncated };
}
