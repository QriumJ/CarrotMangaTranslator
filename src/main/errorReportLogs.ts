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
  jobId?: string,
): Promise<DiagnosticLogCollection> {
  const buckets: DiagnosticLogEntry[][] = [[], [], [], [], [], []];
  let count = 0;
  const append = (entry: DiagnosticLogEntry) => {
    const related = Boolean(
      [executionId, jobId].some(
        (id) => id && entry.line.includes(JSON.stringify(id)),
      ),
    );
    const priority = /\[ERROR\]/.test(entry.line)
      ? 4 + (related ? 1 : 0)
      : (related ? 2 : 0) + (/\[WARN\]/.test(entry.line) ? 1 : 0);
    const bucket = buckets[priority];
    count += 1;
    bucket.push(entry);
    if (bucket.length > ERROR_REPORT_MAX_LOG_ENTRIES) bucket.shift();
  };
  await appendDiagnosticLogEntries(append, previousLogPath, "previous");
  await appendDiagnosticLogEntries(append, currentLogPath, "current");
  const limits = [100, 100, 150, 150, 200, 300].map((limit, index) =>
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
      if (line.trim()) append({ source, line });
    }
  } catch (error) {
    // Missing session logs are normal on first launch. Other failures must not
    // silently produce a report that looks complete.
    if (!isMissingFileError(error)) throw error;
  } finally {
    lines.close();
    input.destroy();
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

const TRUNCATION_MARKER =
  "\n[... middle omitted; beginning and end retained ...]\n";

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
  const remaining = maxBytes - markerBytes;
  const headBytes = Math.ceil(remaining / 2);
  const bytes = Buffer.from(value);
  let tailStart = bytes.length - (remaining - headBytes);
  while (tailStart < bytes.length && (bytes[tailStart] & 0xc0) === 0x80)
    tailStart += 1;
  return {
    text: `${utf8Prefix(value, headBytes)}${TRUNCATION_MARKER}${bytes.subarray(tailStart).toString("utf8")}`,
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
  const available = Math.max(
    0,
    maxBytes - utf8ByteLength(prefix + suffix + omission),
  );
  const values = entries.map(
    (entry) => `[${entry.source}] ${entry.line.replace(/```/g, "` ` `")}`,
  );
  const precedingBytes = [0];
  for (const value of values)
    precedingBytes.push(
      precedingBytes[precedingBytes.length - 1] + utf8ByteLength(value) + 1,
    );
  let usedBytes = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    // Leave space for neighbouring records, while allowing long error details
    // to use available report space instead of always cutting them at 8 KiB.
    const remaining = Math.max(0, available - usedBytes);
    const reserve = Math.min(Math.floor(remaining / 2), precedingBytes[index]);
    const entryBudget = remaining - reserve;
    if (entryBudget < Math.min(256, utf8ByteLength(values[index]))) {
      omitted = true;
      continue;
    }
    const bounded = truncateUtf8(values[index], entryBudget);
    omitted ||= bounded.truncated;
    const candidate = `${prefix}${omission}${[bounded.text, ...selected].join("\n")}${suffix}`;
    if (utf8ByteLength(candidate) > maxBytes) {
      omitted = true;
      continue;
    }
    selected.unshift(bounded.text);
    usedBytes += utf8ByteLength(bounded.text) + 1;
  }
  const result = truncateUtf8(
    `${prefix}${omitted ? omission : ""}${selected.join("\n")}${suffix}`,
    maxBytes,
  );
  return { text: result.text, truncated: omitted || result.truncated };
}
