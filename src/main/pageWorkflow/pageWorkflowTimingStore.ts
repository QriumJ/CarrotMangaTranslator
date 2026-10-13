import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  PageWorkflowTimingSchema,
  type PageWorkflowTiming,
} from "../../shared/pageWorkflowTiming";
import { readJsonFile } from "../libraryStore/storage";
import { logWarn } from "../logger";

// Separate from immutable resume inputs: pruning telemetry never removes a run.
const active = new Set<string>();

export function workflowTimingPath(
  dataRoot: string,
  attemptId: string,
): string {
  return join(dataRoot, "page-workflow-timings", `${attemptId}.json`);
}

export function markWorkflowTimingActive(path: string, running: boolean): void {
  if (running) active.add(path);
  else active.delete(path);
}

export async function readPageWorkflowTimings(
  dataRoot: string,
  chapterId?: string,
): Promise<PageWorkflowTiming[]> {
  const directory = join(dataRoot, "page-workflow-timings");
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records: PageWorkflowTiming[] = [];
  for (const name of names.filter((name) =>
    /^[\da-f-]{36}\.json$/i.test(name),
  )) {
    const path = join(directory, name);
    try {
      const record = PageWorkflowTimingSchema.parse(await readJsonFile(path));
      if (record.status === "running" && !active.has(path)) {
        record.status = "interrupted";
        // Reads must not overwrite a recorder's concurrent terminal checkpoint.
        // An orphan remains interrupted on every subsequent read and is prunable.
      }
      if (
        !chapterId ||
        record.chapters.some((chapter) => chapter.id === chapterId)
      )
        records.push(record);
    } catch (error) {
      logWarn("Could not read workflow timing record", { name, error });
    }
  }
  return records.sort(
    (a, b) =>
      b.startedAt.localeCompare(a.startedAt) ||
      b.attemptId.localeCompare(a.attemptId),
  );
}
