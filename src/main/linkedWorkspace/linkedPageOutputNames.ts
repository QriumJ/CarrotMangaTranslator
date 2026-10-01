import { extname } from "node:path";
import { lstat } from "node:fs/promises";
import type { MangaPage, ChapterSnapshot } from "../../shared/libraryTypes";
import type { LinkedWorkspaceRecordV1 } from "../../shared/linkedWorkspaceTypes";
import { explicitPageOutputBase } from "../../shared/pageOutputNaming";
import {
  resolveLinkedResultPath,
  relativePathFromRoot,
  resolvePathInside,
} from "./linkedWorkspacePaths";

export function linkedPageResultSource(
  record: LinkedWorkspaceRecordV1,
  page: MangaPage,
): string | undefined {
  const explicit = explicitPageOutputBase(page);
  return explicit === undefined
    ? record.pageRelativePaths[page.id]
    : explicit + extname(page.sourceFileName ?? page.name);
}

export async function validateLinkedPageOutputNames(
  records: Iterable<LinkedWorkspaceRecordV1>,
  chapter: ChapterSnapshot,
): Promise<void> {
  const all = [...records];
  for (const record of all) {
    if (record.chapterId === chapter.id)
      await validateRecord(record, all, chapter);
  }
}

async function validateRecord(
  record: LinkedWorkspaceRecordV1,
  all: LinkedWorkspaceRecordV1[],
  chapter: ChapterSnapshot,
): Promise<void> {
  const seen = reservedPaths(record, all);
  for (const page of chapter.pages) {
    const path = resultPath(record, page);
    if (!path) continue;
    const key = path.normalize("NFC").toLowerCase();
    if (seen.has(key) && (page.outputBaseName || seen.get(key)))
      throw new Error(`출력 이름이 겹칩니다: ${page.name}`);
    seen.set(key, Boolean(page.outputBaseName));
    if (page.outputBaseName && record.artifacts[page.id]?.result?.path !== path)
      await assertNewOutputPath(record.rootPath, path);
  }
}

async function assertNewOutputPath(root: string, path: string): Promise<void> {
  try {
    await lstat(resolvePathInside(root, path));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return;
    throw error;
  }
  throw new Error(`기존 출력 파일이 있습니다: ${path}`);
}

function reservedPaths(
  record: LinkedWorkspaceRecordV1,
  all: LinkedWorkspaceRecordV1[],
): Map<string, boolean> {
  const seen = new Map<string, boolean>();
  for (const other of all) {
    if (
      other.id === record.id ||
      other.rootPath.toLowerCase() !== record.rootPath.toLowerCase()
    )
      continue;
    for (const path of Object.values(other.resultRelativePaths ?? {}))
      seen.set(path.normalize("NFC").toLowerCase(), false);
  }
  return seen;
}

function resultPath(
  record: LinkedWorkspaceRecordV1,
  page: MangaPage,
): string | undefined {
  const sourceRelativePath = linkedPageResultSource(record, page);
  if (!sourceRelativePath) return undefined;
  const output = resolveLinkedResultPath({
    rootPath: record.rootPath,
    sourceRelativePath,
    format: record.output.format,
  });
  const path = relativePathFromRoot(record.rootPath, output.path);
  return page.outputBaseName
    ? path
    : (record.resultRelativePaths?.[page.id] ?? path);
}
