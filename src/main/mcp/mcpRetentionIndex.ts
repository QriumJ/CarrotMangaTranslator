import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { LibraryTransaction } from "../libraryStore/libraryTransaction";
import { writeDurableJsonFile } from "../libraryStore/libraryTransactionStorage";
import {
  RetentionIndexSchema,
  type RetentionIndex,
} from "./mcpRetentionRecords";

const PAGE_SIZE = 256;
const manifestSchema = z
  .object({
    version: z.literal(2),
    generation: z.uuid(),
    pageCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
const pageSchema = z
  .object({
    version: z.literal(2),
    generation: z.uuid(),
    page: z.number().int().nonnegative(),
    entries: RetentionIndexSchema.shape.entries.max(PAGE_SIZE),
  })
  .strict();
type Read = (path: string, missing: boolean) => Promise<unknown>;
type Seal = (value: unknown) => Promise<unknown>;

/** Pages and their root manifest publish in the same native transaction.
 * v1 remains readable; no record payload, owner or identity changes on migration. */
export async function readRetentionIndex(
  path: string,
  value: unknown,
  read: Read,
): Promise<RetentionIndex> {
  if (
    value &&
    typeof value === "object" &&
    "version" in value &&
    value.version === 1
  )
    return RetentionIndexSchema.parse(value);
  const manifest = manifestSchema.parse(value);
  const entries: RetentionIndex["entries"] = [];
  for (let page = 0; page < manifest.pageCount; page++) {
    const payload = pageSchema.parse(
      await read(pagePath(path, manifest.generation, page), false),
    );
    if (
      payload.generation !== manifest.generation ||
      payload.page !== page ||
      (page < manifest.pageCount - 1 && payload.entries.length !== PAGE_SIZE) ||
      !payload.entries.length
    )
      throw new Error("Retained catalog page binding is invalid.");
    entries.push(...payload.entries);
  }
  return RetentionIndexSchema.parse({ version: 1, entries });
}

export async function stageRetentionIndex(
  transaction: LibraryTransaction,
  path: string,
  index: RetentionIndex,
  read: Read,
  seal: Seal,
) {
  const old = await read(path, true);
  const previous =
    old && typeof old === "object" && "version" in old && old.version === 2
      ? manifestSchema.parse(old)
      : undefined;
  const generation = randomUUID();
  const pageCount = Math.ceil(index.entries.length / PAGE_SIZE);
  if (previous && previous.pageCount === pageCount) {
    await stageChangedPages(transaction, path, index, previous, read, seal);
    return;
  }
  const directory = await transaction.createPublishedDirectory(
    catalogPath(path, generation),
  );
  for (let page = 0; page < pageCount; page++) {
    const value = pageSchema.parse({
      version: 2,
      generation,
      page,
      entries: index.entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    });
    await writeDurableJsonFile(
      join(directory.stagingDirectory, `${page}.json`),
      await seal(value),
    );
  }
  await transaction.stageJsonReplacement(
    path,
    await seal({ version: 2, generation, pageCount }),
  );
  if (previous)
    await transaction.retireDirectory(catalogPath(path, previous.generation));
}

async function stageChangedPages(
  transaction: LibraryTransaction,
  path: string,
  index: RetentionIndex,
  manifest: z.infer<typeof manifestSchema>,
  read: Read,
  seal: Seal,
) {
  for (let page = 0; page < manifest.pageCount; page++) {
    const target = pagePath(path, manifest.generation, page);
    const next = pageSchema.parse({
      version: 2,
      generation: manifest.generation,
      page,
      entries: index.entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    });
    if (!isDeepStrictEqual(await read(target, false), next))
      await transaction.stageJsonReplacement(target, await seal(next));
  }
}

function catalogPath(path: string, generation: string) {
  return join(dirname(path), `catalog-${z.uuid().parse(generation)}`);
}
function pagePath(path: string, generation: string, page: number) {
  return join(catalogPath(path, generation), `${page}.json`);
}
