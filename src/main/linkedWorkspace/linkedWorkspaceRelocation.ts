import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LinkedWorkspaceRecordV1 } from "../../shared/linkedWorkspaceTypes";
import { writeJsonFile } from "../libraryStore/storage";
import {
  assertPlainLinkedPath,
  ownedLinkedWorkspaceFiles,
} from "./linkedWorkspaceDeletion";
import { fingerprintBuffer, fingerprintFile } from "./linkedWorkspaceFiles";
import {
  buildLinkedMirrorFileName,
  resolvePathInside,
} from "./linkedWorkspacePaths";
import {
  assertManagedResultRoot,
  copyVerifiedLinkedFile,
  linkedPathExists,
  relocationJournalDirectory,
  reserveResultRoot,
} from "./linkedWorkspaceRelocationFiles";
import {
  finishLinkedRelocation,
  type LinkedRelocationJournal,
} from "./linkedWorkspaceRelocationRecovery";

type RelocationOptions = {
  dataRoot: string;
  record: LinkedWorkspaceRecordV1;
  preferred: string;
  workTitle: string;
  chapterTitle: string;
  publish: (
    record: LinkedWorkspaceRecordV1,
    committed: () => void,
  ) => Promise<void>;
};

export async function relocateLinkedResults(options: RelocationOptions) {
  const { dataRoot, record, preferred } = options;
  if (record.destinationKind !== "managed")
    throw new Error("직접 지정한 폴더는 정리 대상이 아닙니다.");
  await assertManagedResultRoot(dataRoot, record.rootPath);
  await assertManagedResultRoot(dataRoot, preferred);
  const files = await verifyLinkedResultOwnership(record);
  const mirror = await prepareMirror(options);
  const newRoot = await reserveResultRoot(preferred);
  const journal: LinkedRelocationJournal = {
    id: randomUUID(),
    recordId: record.id,
    oldRoot: record.rootPath,
    newRoot,
    files: files.map((file) => ({
      source: file.path,
      target: file.path,
      sha256: file.sha256,
    })),
  };
  if (mirror)
    journal.files.push({
      source: buildLinkedMirrorFileName(record.rootPath),
      target: buildLinkedMirrorFileName(newRoot),
      sha256: mirror.sourceHash,
      targetSha256: fingerprintBuffer(mirror.content),
    });
  const directory = relocationJournalDirectory(dataRoot);
  await assertPlainLinkedPath(directory);
  await mkdir(directory, { recursive: true });
  const journalPath = join(directory, `${journal.id}.json`);
  await writeJsonFile(journalPath, journal);
  let committed = false;
  try {
    for (const file of files)
      await copyVerifiedLinkedFile(
        resolvePathInside(record.rootPath, file.path),
        resolvePathInside(newRoot, file.path),
        file.sha256,
      );
    if (mirror) {
      const target = resolvePathInside(
        newRoot,
        buildLinkedMirrorFileName(newRoot),
      );
      await assertPlainLinkedPath(target);
      await writeFile(target, mirror.content, { flag: "wx" });
    }
    const next = {
      ...structuredClone(record),
      rootPath: newRoot,
      // Publish the old location with the new root so interruption cannot lose it.
      organization: {
        preservedRootPaths: [
          ...new Set([
            record.rootPath,
            ...(record.organization?.preservedRootPaths ?? []),
          ]),
        ],
      },
      updatedAt: new Date().toISOString(),
    };
    await options.publish(next, () => {
      committed = true;
    });
    const preserved = await finishLinkedRelocation(dataRoot, journal, true);
    await unlink(journalPath);
    return { record: next, preserved };
  } catch (error) {
    if (!committed) {
      await finishLinkedRelocation(dataRoot, journal, false);
      await unlink(journalPath);
    }
    // After publication the journal is retained for startup recovery.
    throw error;
  }
}

export async function verifyLinkedResultOwnership(
  record: LinkedWorkspaceRecordV1,
) {
  const files = new Map<string, { path: string; sha256: string }>();
  for (const file of ownedLinkedWorkspaceFiles(record)) {
    const absolute = resolvePathInside(record.rootPath, file.path);
    await assertPlainLinkedPath(absolute);
    if (!(await linkedPathExists(absolute)))
      throw new Error(
        `기록된 결과 파일을 찾지 못했습니다. 기존 폴더를 보존했습니다: ${absolute}`,
      );
    if ((await fingerprintFile(absolute)).sha256 !== file.sha256)
      throw new Error(
        `앱 밖에서 변경된 파일이 있어 기존 폴더를 보존했습니다: ${absolute}`,
      );
    const prior = files.get(absolute.toLowerCase());
    if (prior && prior.sha256 !== file.sha256)
      throw new Error("결과 파일의 소유권 기록이 충돌합니다.");
    files.set(absolute.toLowerCase(), file);
  }
  for (const relative of Object.values(
    record.sourceRelativePaths ?? record.pageRelativePaths,
  )) {
    if (!files.has(resolvePathInside(record.rootPath, relative).toLowerCase()))
      throw new Error(
        "복구 원본의 소유권을 확인할 수 없어 기존 폴더를 보존했습니다.",
      );
  }
  return [...files.values()];
}

async function prepareMirror({
  record,
  workTitle,
  chapterTitle,
}: RelocationOptions) {
  const path = resolvePathInside(
    record.rootPath,
    buildLinkedMirrorFileName(record.rootPath),
  );
  await assertPlainLinkedPath(path);
  if (!(await linkedPathExists(path))) return null;
  const content = await readFile(path);
  const mirror = JSON.parse(content.toString("utf8"));
  if (
    mirror?.schemaVersion !== 1 ||
    !Array.isArray(mirror.chapters) ||
    mirror.chapters.length !== 1 ||
    mirror.chapters[0].id !== record.chapterId ||
    mirror.chapters[0].workId !== record.workId
  )
    throw new Error(
      "다른 화와 공유하거나 확인할 수 없는 복구 문서가 있어 폴더를 보존했습니다.",
    );
  mirror.chapters[0].workTitle = workTitle;
  mirror.chapters[0].title = chapterTitle;
  return {
    sourceHash: fingerprintBuffer(content),
    content: Buffer.from(JSON.stringify(mirror, null, 2)),
  };
}
