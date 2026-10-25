import { isDeepStrictEqual } from "node:util";
import { dirname, join } from "node:path";
import { mkdir, lstat, readFile, readdir } from "node:fs/promises";
import { z } from "zod";
import { getLibraryRoot } from "../library";
import type { LibraryTransaction } from "../libraryStore/libraryTransaction";
import {
  assertPathWithinRootWithoutSymlinks,
  writeDurableJsonFile,
  writeDurableFile,
} from "../libraryStore/libraryTransactionStorage";
import { retainInlineImages, restoreInlineImages } from "./mcpRetentionImages";
import { readRetentionIndex, stageRetentionIndex } from "./mcpRetentionIndex";
import {
  isRetentionActive,
  observeRetentionActivity,
  protectedRetentionIds,
  rotateRetentionHistory,
} from "./mcpRetentionPolicy";
import { retainLibraryArtifacts } from "../libraryStore/libraryArtifactRetention";
import { McpEditError } from "../application/mcpEditPolicy";
import {
  RetentionIndexSchema,
  MCP_RETENTION_CLEANUP_BATCH,
  type RetentionIndex,
  type RetentionEntry,
} from "./mcpRetentionRecords";

export type McpRetentionCodec = {
  seal: (value: unknown) => Promise<unknown>;
  open: (value: unknown) => Promise<unknown>;
};
/** All writes join an existing native library transaction under the native write lock.
 * The index and record metadata are encrypted and bound to the current data profile. */
export class McpRetentionStorage {
  private readonly touched = new WeakMap<LibraryTransaction, Set<string>>();
  private readonly stagedRecords = new WeakMap<
    LibraryTransaction,
    Map<string, unknown>
  >();
  constructor(
    readonly codec: McpRetentionCodec,
    readonly now = Date.now,
    private readonly activeSettlement: (id: string) => boolean = () => false,
  ) {}
  observeActivity() {
    return observeRetentionActivity(getLibraryRoot(), this.activeSettlement);
  }
  async withRecordLease<T>(id: string, operation: () => Promise<T>) {
    const release = retainLibraryArtifacts([await this.path(id)]);
    try {
      return await operation();
    } finally {
      release();
    }
  }
  async path(id?: string, asset?: string): Promise<string> {
    if (id) z.string().uuid().parse(id);
    if (asset)
      z.string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(asset);
    const path = id
      ? join(
          getLibraryRoot(),
          ".mcp-retained",
          id,
          asset ? `${asset}.bin` : "record.json",
        )
      : join(getLibraryRoot(), ".mcp-retained", "index.json");
    await assertPathWithinRootWithoutSymlinks(getLibraryRoot(), path, {
      allowMissingTarget: true,
    });
    return path;
  }
  async index(): Promise<RetentionIndex> {
    const path = await this.path();
    const value = await this.read(path, true);
    if (value !== null)
      return readRetentionIndex(path, value, this.read.bind(this));
    const entries = await readdir(dirname(path)).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      },
    );
    if (entries.length)
      throw new Error(
        "Retained index is missing but recovery records remain; refusing to replace history.",
      );
    return { version: 1, entries: [] };
  }
  /** Unexpired entries in stable newest-first order. The caller holds its read lock
   * and validates each current record before exposing a domain view. */
  async listOwned(owner: string, kind: RetentionEntry["kind"]) {
    const entries = (await this.index()).entries.filter(
      (entry) =>
        entry.kind === kind &&
        entry.owner === owner &&
        entry.expiresAt > this.now(),
    );
    return entries.sort(
      (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id),
    );
  }
  async owned(owner: string, id: string, kind?: RetentionEntry["kind"]) {
    const index = await this.index();
    const entry = index.entries.find(
      (item) => item.id === id && item.owner === owner,
    );
    if (
      !entry ||
      entry.expiresAt <= this.now() ||
      (kind && entry.kind !== kind)
    )
      throw new McpEditError(
        "not_found",
        "Retained record is missing, expired or owned by another connection.",
      );
    if (entry.reclaimedAt !== undefined)
      throw new McpEditError(
        "history_reclaimed",
        "Older recovery history was automatically rotated. The saved page remains intact; do not repeat the original operation.",
      );
    return { index, entry };
  }
  async record(id: string): Promise<unknown> {
    return this.read(await this.path(id), false);
  }
  async stageIndex(transaction: LibraryTransaction, index: RetentionIndex) {
    const checked = RetentionIndexSchema.parse(index);
    const policy = this.policy(checked, transaction);
    const protectedIds = new Set(this.touched.get(transaction));
    await rotateRetentionHistory(policy, protectedIds, (id) =>
      this.retire(transaction, id),
    );
    await stageRetentionIndex(
      transaction,
      await this.path(),
      checked,
      this.read.bind(this),
      this.sealMetadata.bind(this),
    );
  }
  /** The domain caller validates its record and holds the native write lock.
   * Essential metadata keeps its domain lifetime, encryption and atomic index update. */
  async stageMetadataRecord(
    transaction: LibraryTransaction,
    metadata: Omit<
      RetentionEntry,
      "bytes" | "pageCount" | "mimeType" | "sha256" | "kind"
    > &
      (
        | {
            kind:
              | "research-batch"
              | "chapter-discovery"
              | "import-batch"
              | "library";
            pageCount?: never;
          }
        | {
            kind: "work-file-import" | "composite-workflow";
            pageCount: number;
          }
      ),
    value: unknown,
  ) {
    const index = await this.prune(transaction, await this.index());
    const directory = await this.create(transaction, metadata.id);
    const bytes = await this.writeRecord(directory.stagingDirectory, value);
    index.entries.push({
      ...metadata,
      bytes,
      pageCount: metadata.pageCount ?? 0,
      mimeType: null,
      sha256: null,
    });
    await this.stageIndex(transaction, index);
  }
  async stageRecord(
    transaction: LibraryTransaction,
    id: string,
    value: unknown,
    workflowOwner?: { expected: string; next: string },
    stagedIndex?: RetentionIndex,
  ) {
    this.touch(transaction, id);
    const records =
      this.stagedRecords.get(transaction) ?? new Map<string, unknown>();
    records.set(id, value);
    this.stagedRecords.set(transaction, records);
    const path = await this.path(id);
    const old = await lstat(path);
    if (!old.isFile() || old.isSymbolicLink())
      throw new Error("Invalid retained record file.");
    const packed = await retainInlineImages(
      getLibraryRoot(),
      value,
      dirname(path),
      (target, bytes) => transaction.stageBytesReplacement(target, bytes),
    );
    const sealed = await this.sealMetadata(packed.value);
    const bytes = Buffer.byteLength(JSON.stringify(sealed, null, 2)) + 1;
    const index = stagedIndex ?? (await this.index());
    const entry = index.entries.find((item) => item.id === id);
    if (!entry) throw new Error("Retained record has no index entry.");
    if (workflowOwner) {
      if (entry.kind !== "workflow" || entry.owner !== workflowOwner.expected)
        throw new McpEditError("revision_conflict", "Workflow owner changed.");
      const next = z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,128}$/)
        .parse(workflowOwner.next);
      z.object({ owner: z.literal(next) })
        .passthrough()
        .parse(value);
      entry.owner = next;
      // The previous connection's prepare request is not a new owner's admission.
      entry.requestId = null;
    }
    entry.bytes += bytes - old.size + packed.addedBytes;
    await transaction.stageJsonReplacement(path, sealed);
    // A coupled publication stages its shared index once, after all records.
    if (!stagedIndex) await this.stageIndex(transaction, index);
  }
  async create(transaction: LibraryTransaction, id: string) {
    this.touch(transaction, id);
    const base = join(getLibraryRoot(), ".mcp-retained");
    await this.path(id);
    await mkdir(base, { recursive: true, mode: 0o700 });
    return transaction.createPublishedDirectory(join(base, id));
  }
  async writeRecord(directory: string, value: unknown): Promise<number> {
    const packed = await retainInlineImages(
      getLibraryRoot(),
      value,
      directory,
      writeDurableFile,
    );
    const sealed = await this.sealMetadata(packed.value);
    const bytes = Buffer.byteLength(JSON.stringify(sealed, null, 2)) + 1;
    await writeDurableJsonFile(join(directory, "record.json"), sealed);
    await this.verifyRecord(directory, value);
    return bytes + packed.addedBytes;
  }
  /** Native staged record check. Uses the same bounded reader as restarted sessions. */
  async verifyRecord(directory: string, expected: unknown): Promise<void> {
    const path = join(directory, "record.json");
    await assertPathWithinRootWithoutSymlinks(getLibraryRoot(), path);
    if (
      !isDeepStrictEqual(
        await this.read(path, false),
        JSON.parse(JSON.stringify(expected)),
      )
    )
      throw new Error(
        "Written retained metadata does not match its recovery source.",
      );
  }
  async prune(transaction: LibraryTransaction, index: RetentionIndex) {
    if (!index.entries.some((entry) => entry.expiresAt <= this.now()))
      return index;
    const protectedIds = await protectedRetentionIds(this.policy(index));
    const expired = index.entries
      .filter(
        (entry) => entry.expiresAt <= this.now() && !protectedIds.has(entry.id),
      )
      .slice(0, MCP_RETENTION_CLEANUP_BATCH);
    const retired = new Set(expired.map((entry) => entry.id));
    for (const entry of expired)
      if (entry.reclaimedAt === undefined)
        await this.retire(transaction, entry.id);
    const next = {
      ...index,
      entries: index.entries.filter((entry) => !retired.has(entry.id)),
    };
    return next;
  }
  /** Validate readable encrypted state before expensive work. History targets
   * are enforced by rotation at publication, never by refusing new work. */
  async assertCanAdd() {
    await this.index();
  }
  private policy(index: RetentionIndex, transaction?: LibraryTransaction) {
    const records = transaction && this.stagedRecords.get(transaction);
    return {
      root: getLibraryRoot(),
      index,
      now: this.now(),
      active: (id: string) =>
        this.activeSettlement(id) || isRetentionActive(getLibraryRoot(), id),
      read: (id: string) =>
        records?.has(id) ? Promise.resolve(records.get(id)) : this.record(id),
    };
  }
  private touch(transaction: LibraryTransaction, id: string) {
    const ids = this.touched.get(transaction) ?? new Set<string>();
    ids.add(id);
    this.touched.set(transaction, ids);
  }
  /** The caller verifies ownership under its library lock. A supplied index makes
   * directory retirement and catalog removal one indivisible publication. */
  async retire(
    transaction: LibraryTransaction,
    id: string,
    index?: RetentionIndex,
  ) {
    await this.path(id);
    await transaction.retireDirectory(
      join(getLibraryRoot(), ".mcp-retained", id),
      { required: false },
    );
    if (index)
      await this.stageIndex(transaction, {
        ...index,
        entries: index.entries.filter((entry) => entry.id !== id),
      });
  }
  /** Validate the serialized envelope as a reader would, not only encryption success.
   * The comparison uses JSON's existing optional-field semantics and never writes plaintext. */
  private async sealMetadata(value: unknown): Promise<unknown> {
    const expected = JSON.parse(JSON.stringify(value));
    const sealed = JSON.parse(JSON.stringify(await this.codec.seal(value)));
    if (!isDeepStrictEqual(await this.codec.open(sealed), expected))
      throw new Error("Encrypted retained metadata does not match its source.");
    if (
      Buffer.byteLength(JSON.stringify(sealed, null, 2)) + 1 >
      8 * 1024 * 1024
    )
      throw new Error("Retained metadata exceeds 8 MiB.");
    return sealed;
  }
  private async read(path: string, missing: boolean): Promise<unknown | null> {
    await assertPathWithinRootWithoutSymlinks(getLibraryRoot(), path, {
      allowMissingTarget: missing,
    });
    const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (missing && error.code === "ENOENT") return null;
      throw error;
    });
    if (info === null) return null;
    if (!info.isFile() || info.isSymbolicLink() || info.size > 8 * 1024 * 1024)
      throw new Error("Invalid or oversized retained metadata.");
    const text = await readFile(path, "utf8");
    if (Buffer.byteLength(text) > 8 * 1024 * 1024)
      throw new Error("Retained metadata grew while reading.");
    return restoreInlineImages(
      getLibraryRoot(),
      await this.codec.open(JSON.parse(text)),
      dirname(path),
    );
  }
}
