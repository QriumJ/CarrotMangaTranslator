import { createHash, randomUUID } from "node:crypto";
import { open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import type { ErrorReportContext } from "../shared/errorReportTypes";
import type { ErrorReportBuildEnvironment } from "./errorReportEnvironment";
import { buildSystemMarkdown } from "./errorReportEnvironment";
import { redactDiagnosticText } from "./errorReportRedaction";
import {
  writeDurableFile,
  writeDurableJsonFile,
} from "./libraryStore/libraryTransactionStorage";

// Below GitHub's per-file inline-content limit; no limit on the number of parts.
const PART_BYTES = 256 * 1024;
const partSchema = z.object({
  name: z.string().regex(/^(error|system|current|previous)-\d+\.txt$/),
  kind: z.enum(["error", "system", "current", "previous"]),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
const snapshotSchema = z.object({
  id: z.string().uuid(),
  capturedAt: z.string(),
  parts: z.array(partSchema),
  missingLogs: z.array(z.enum(["current", "previous"])),
});
export type ReportSnapshot = z.infer<typeof snapshotSchema>;
export type ReportPart = z.infer<typeof partSchema>;

export function reportSnapshotDirectory(
  dataRoot: string,
  reportId: string,
): string {
  return join(
    dataRoot,
    "github-report-private",
    "reports",
    z.string().uuid().parse(reportId),
  );
}

export async function captureReportSnapshot(
  context: ErrorReportContext,
  environment: ErrorReportBuildEnvironment,
): Promise<ReportSnapshot> {
  const snapshot: ReportSnapshot = {
    id: randomUUID(),
    capturedAt: new Date().toISOString(),
    parts: [],
    missingLogs: [],
  };
  const directory = reportSnapshotDirectory(
    environment.appPaths.dataRoot,
    snapshot.id,
  );
  const redact = (value: string) =>
    redactDiagnosticText(value, {
      appPaths: environment.appPaths,
      homeDir: environment.homeDir,
    }).text;
  const error = new SnapshotWriter(directory, "error", snapshot.parts);
  // Redact individual values so a stack/path in one field cannot hide siblings.
  const safeContext = Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      typeof value === "string" ? redact(value) : value,
    ]),
  );
  await error.append(
    JSON.stringify(
      {
        context: safeContext,
        executionDiagnostics: environment.executionDiagnostics
          ? redact(JSON.stringify(environment.executionDiagnostics))
          : null,
      },
      null,
      2,
    ),
  );
  await error.finish();
  const system = new SnapshotWriter(directory, "system", snapshot.parts);
  await system.append(redact(buildSystemMarkdown(environment)));
  await system.finish();
  for (const [kind, path] of [
    ["previous", environment.previousLogPath],
    ["current", environment.currentLogPath],
  ] as const) {
    const exists = await captureLog(
      path,
      new SnapshotWriter(directory, kind, snapshot.parts),
      redact,
    );
    if (!exists) snapshot.missingLogs.push(kind);
  }
  await writeDurableJsonFile(join(directory, "snapshot.json"), snapshot);
  return snapshot;
}

export async function loadReportSnapshot(
  dataRoot: string,
  id: string,
): Promise<ReportSnapshot> {
  const path = join(reportSnapshotDirectory(dataRoot, id), "snapshot.json");
  const snapshot = snapshotSchema.parse(
    JSON.parse(await readFile(path, "utf8")),
  );
  if (snapshot.id !== id) throw new Error("Report snapshot identity mismatch.");
  return snapshot;
}

export async function readReportPart(
  directory: string,
  part: ReportPart,
): Promise<string> {
  const bytes = await readFile(join(directory, partSchema.parse(part).name));
  if (bytes.length !== part.bytes || digest(bytes) !== part.sha256)
    throw new Error(
      "Saved report integrity check failed. Prepare the report again.",
    );
  return bytes.toString("utf8");
}

export function digest(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

async function captureLog(
  path: string,
  writer: SnapshotWriter,
  redact: (text: string) => string,
): Promise<boolean> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, "r");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile())
      throw new Error("Diagnostic log is not a regular file.");
    const size = stat.size;
    if (size) {
      // Freeze the byte boundary before reading, even while the app appends logs.
      const stream = handle.createReadStream({
        end: size - 1,
        autoClose: false,
        encoding: "utf8",
      });
      await captureLines(stream, writer, redact);
    }
    await writer.finish();
    return true;
  } finally {
    await handle.close();
  }
}

async function captureLines(
  stream: import("node:fs").ReadStream,
  writer: SnapshotWriter,
  redact: (text: string) => string,
): Promise<void> {
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) await writer.append(`${redact(line)}\n`);
  } finally {
    lines.close();
    stream.destroy();
  }
}

class SnapshotWriter {
  private pending = Buffer.alloc(0);
  private index = 0;
  constructor(
    private readonly directory: string,
    private readonly kind: ReportPart["kind"],
    private readonly parts: ReportPart[],
  ) {}
  async append(text: string): Promise<void> {
    let bytes: Buffer = Buffer.concat([this.pending, Buffer.from(text)]);
    while (bytes.length >= PART_BYTES) {
      let end = PART_BYTES;
      // Never split a UTF-8 code point across files.
      while (end < bytes.length && (bytes.readUInt8(end) & 0xc0) === 0x80)
        end--;
      await this.write(bytes.subarray(0, end));
      bytes = bytes.subarray(end);
    }
    this.pending = Buffer.from(bytes);
  }
  async finish(): Promise<void> {
    if (this.pending.length || this.index === 0) await this.write(this.pending);
    this.pending = Buffer.alloc(0);
  }
  private async write(bytes: Buffer): Promise<void> {
    const name = `${this.kind}-${String(++this.index).padStart(6, "0")}.txt`;
    await writeDurableFile(join(this.directory, name), bytes);
    this.parts.push({
      name,
      kind: this.kind,
      bytes: bytes.length,
      sha256: digest(bytes),
    });
  }
}
