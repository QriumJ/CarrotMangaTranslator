import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isLibraryArtifactRetained } from "../libraryStore/libraryArtifactRetention";
import { McpWorkflowRecordSchema } from "../application/mcpWorkflowPolicy";
import { parseCompositeRecord } from "../application/mcpCompositeWorkflowRecord";
import {
  RetainedChangeSchema,
  MCP_RETENTION_BYTES,
  MCP_RETENTION_CAPACITY,
  MCP_RETENTION_CLEANUP_BATCH,
  type RetentionIndex,
  type RetentionEntry,
} from "./mcpRetentionRecords";

const activities = new Map<string, Set<(id: string) => boolean>>();
const profileKey = (root: string) =>
  process.platform === "win32" ? resolve(root).toLowerCase() : resolve(root);

/** Session predicates share the data-profile boundary, not the OAuth owner boundary. */
export function observeRetentionActivity(
  root: string,
  active: (id: string) => boolean,
) {
  const key = profileKey(root);
  const observers = activities.get(key) ?? new Set();
  observers.add(active);
  activities.set(key, observers);
  return () => {
    observers.delete(active);
    if (!observers.size) activities.delete(key);
  };
}
export function isRetentionActive(root: string, id: string) {
  return (
    [...(activities.get(profileKey(root)) ?? [])].some((active) =>
      active(id),
    ) ||
    isLibraryArtifactRetained(join(root, ".mcp-retained", id, "record.json"))
  );
}

type PolicyInput = {
  root: string;
  index: RetentionIndex;
  now: number;
  active: (id: string) => boolean;
  read: (id: string) => Promise<unknown>;
};

/** Durable parents protect their referenced changes even after session reconstruction.
 * An unreadable parent conservatively protects its owner's history; it never authorizes deletion. */
export async function protectedRetentionIds(input: PolicyInput) {
  const protectedIds = new Set<string>();
  const protectedOwners = new Set<string>();
  for (const entry of input.index.entries) {
    if (input.active(entry.id)) {
      protectedIds.add(entry.id);
      // A running parent's next child receipt may not have been checkpointed yet.
      if (entry.kind !== "change") protectedOwners.add(entry.owner);
    }
  }
  await protectParentGraph(input, protectedIds, protectedOwners);
  for (const entry of input.index.entries)
    if (
      entry.kind === "change" &&
      (protectedOwners.has(entry.owner) ||
        (entry.requestId !== null && protectedIds.has(entry.requestId)))
    )
      protectedIds.add(entry.id);
  return protectedIds;
}

async function protectParentGraph(
  input: PolicyInput,
  protectedIds: Set<string>,
  protectedOwners: Set<string>,
) {
  // An unexpired composite may need an older child and its changes regardless of entry order.
  const parents = input.index.entries.filter((entry) =>
    ["workflow", "composite-workflow"].includes(entry.kind),
  );
  const visited = new Set<string>();
  let pending = parents.filter(
    (entry) => entry.expiresAt > input.now || protectedIds.has(entry.id),
  );
  while (pending.length) {
    for (const entry of pending) {
      visited.add(entry.id);
      await protectParentReferences(
        input,
        entry,
        protectedIds,
        protectedOwners,
      );
    }
    pending = parents.filter(
      (entry) => !visited.has(entry.id) && protectedIds.has(entry.id),
    );
  }
}

async function protectParentReferences(
  input: PolicyInput,
  entry: RetentionEntry,
  protectedIds: Set<string>,
  protectedOwners: Set<string>,
) {
  if (
    !["workflow", "composite-workflow"].includes(entry.kind) ||
    (entry.expiresAt <= input.now && !protectedIds.has(entry.id))
  )
    return;
  try {
    const value = await input.read(entry.id);
    const record =
      entry.kind === "workflow"
        ? McpWorkflowRecordSchema.parse(value)
        : parseCompositeRecord(value);
    if (record.id !== entry.id || record.owner !== entry.owner)
      throw new Error("Parent identity mismatch.");
    collectReferences(record, protectedIds);
  } catch (error) {
    // Invalid optional protection evidence must preserve history, never delete it.
    void error;
    protectedOwners.add(entry.owner);
  }
}

function collectReferences(value: unknown, ids: Set<string>) {
  if (typeof value === "string") {
    // Only exact catalog IDs can match; nested native child receipts are included.
    if (/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(value)) ids.add(value);
  } else if (Array.isArray(value)) {
    for (const child of value) collectReferences(child, ids);
  } else if (value && typeof value === "object") {
    for (const child of Object.values(value)) collectReferences(child, ids);
  }
}

/** Only ordinary page-history payloads rotate. Essential records do not consume this budget. */
export async function rotateRetentionHistory(
  input: PolicyInput,
  protectedIds: Set<string>,
  retire: (id: string) => Promise<void>,
) {
  const changes = input.index.entries.filter(
    (entry) => entry.kind === "change" && entry.reclaimedAt === undefined,
  );
  let bytes = changes.reduce((sum, entry) => sum + entry.bytes, 0);
  let count = changes.length;
  if (bytes <= MCP_RETENTION_BYTES && count <= MCP_RETENTION_CAPACITY) return;
  for (const id of await protectedRetentionIds(input)) protectedIds.add(id);
  changes.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  let retired = 0;
  for (const entry of changes) {
    if (
      (bytes <= MCP_RETENTION_BYTES && count <= MCP_RETENTION_CAPACITY) ||
      retired === MCP_RETENTION_CLEANUP_BATCH
    )
      break;
    if (protectedIds.has(entry.id) || !(await canRotate(input, entry)))
      continue;
    await retire(entry.id);
    retired++;
    bytes -= entry.bytes;
    count--;
    // Identity remains until the original expiry; never turn missing payload into new work.
    entry.bytes = 0;
    entry.reclaimedAt = input.now;
  }
}

async function canRotate(input: PolicyInput, entry: RetentionEntry) {
  try {
    const record = RetainedChangeSchema.parse(await input.read(entry.id));
    if (
      record.id !== entry.id ||
      record.owner !== entry.owner ||
      record.pages.length !== entry.pageCount
    )
      return false;
    const directory = join(input.root, ".mcp-retained", entry.id);
    const files = await readdir(directory, { withFileTypes: true });
    return files.every(
      (file) =>
        file.isFile() &&
        !file.isSymbolicLink() &&
        (file.name === "record.json" ||
          /^[a-f0-9]{64}\.(bin|lettering)$/.test(file.name)),
    );
  } catch (error) {
    // Unknown, corrupt or externally modified history is not a cleanup candidate.
    void error;
    return false;
  }
}
