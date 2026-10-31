import { readdir, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { LinkedWorkspaceRecordV1 } from "../../shared/linkedWorkspaceTypes";
import { readJsonFile } from "../libraryStore/storage";
import { assertPlainLinkedPath } from "./linkedWorkspaceDeletion";
import { fingerprintFile } from "./linkedWorkspaceFiles";
import { resolvePathInside } from "./linkedWorkspacePaths";
import {
  assertManagedResultRoot,
  linkedPathExists,
  pruneLinkedResultParents,
  relocationJournalDirectory,
  removeVerifiedLinkedFile,
} from "./linkedWorkspaceRelocationFiles";

const entry = z
  .object({
    source: z.string(),
    target: z.string(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    targetSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
  })
  .strict();
const journalSchema = z
  .object({
    id: z.string().uuid(),
    recordId: z.string().uuid(),
    oldRoot: z.string(),
    newRoot: z.string(),
    files: z.array(entry).max(100_000),
  })
  .strict();
export type LinkedRelocationJournal = z.infer<typeof journalSchema>;

/** Registry publication is the commit point. Recovery never guesses from folder names. */
export async function finishLinkedRelocation(
  dataRoot: string,
  input: LinkedRelocationJournal,
  committed: boolean,
): Promise<boolean> {
  const journal = journalSchema.parse(input);
  await assertManagedResultRoot(dataRoot, journal.oldRoot);
  await assertManagedResultRoot(dataRoot, journal.newRoot);
  if (resolve(journal.oldRoot) === resolve(journal.newRoot))
    throw new Error("Invalid relocation roots.");
  let preserved = false;
  for (const file of journal.files) {
    // After publication, never retire the old copy if the replacement disappeared/changed.
    if (committed && !(await replacementVerified(journal.newRoot, file))) {
      preserved = true;
      continue;
    }
    const root = committed ? journal.oldRoot : journal.newRoot;
    const relative = committed ? file.source : file.target;
    preserved =
      (await removeVerifiedLinkedFile(
        root,
        relative,
        removalHash(file, committed),
      )) || preserved;
    await pruneLinkedResultParents(
      dirname(resolvePathInside(root, relative)),
      dataRoot,
    );
  }
  await pruneLinkedResultParents(
    committed ? journal.oldRoot : journal.newRoot,
    dataRoot,
  );
  preserved ||= committed && (await linkedPathExists(journal.oldRoot));
  return preserved;
}

function removalHash(
  file: LinkedRelocationJournal["files"][number],
  committed: boolean,
) {
  return committed ? file.sha256 : (file.targetSha256 ?? file.sha256);
}

async function replacementVerified(
  root: string,
  file: LinkedRelocationJournal["files"][number],
) {
  const path = resolvePathInside(root, file.target);
  await assertPlainLinkedPath(path);
  return (
    (await linkedPathExists(path)) &&
    (await fingerprintFile(path)).sha256 === (file.targetSha256 ?? file.sha256)
  );
}

export async function recoverLinkedRelocations(
  dataRoot: string,
  records: LinkedWorkspaceRecordV1[],
) {
  const directory = relocationJournalDirectory(dataRoot);
  await assertPlainLinkedPath(directory);
  if (!(await linkedPathExists(directory))) return;
  for (const name of await readdir(directory)) {
    if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue;
    const path = join(directory, name);
    await assertPlainLinkedPath(path);
    const journal = journalSchema.parse(await readJsonFile(path, null));
    if (name !== `${journal.id}.json`)
      throw new Error("Invalid relocation journal.");
    const record = records.find((item) => item.id === journal.recordId);
    if (
      !record ||
      ![journal.oldRoot, journal.newRoot].includes(record.rootPath)
    )
      throw new Error(
        "결과물 이동 기록을 확인할 수 없습니다. 파일을 보존했습니다.",
      );
    await finishLinkedRelocation(
      dataRoot,
      journal,
      record.rootPath === journal.newRoot,
    );
    await unlink(path);
  }
}
