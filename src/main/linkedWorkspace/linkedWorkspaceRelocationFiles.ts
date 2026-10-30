import { copyFile, lstat, mkdir, rmdir, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isPathInside } from "../libraryStore/storage";
import { fingerprintFile } from "./linkedWorkspaceFiles";
import { assertPlainLinkedPath } from "./linkedWorkspaceDeletion";
import { resolvePathInside } from "./linkedWorkspacePaths";

export async function linkedPathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function assertManagedResultRoot(dataRoot: string, root: string) {
  const results = resolve(dataRoot, "results");
  if (!isPathInside(results, root) || resolve(root) === results)
    throw new Error("기본 결과물 폴더 밖의 경로는 정리하지 않습니다.");
  await assertPlainLinkedPath(root);
}

export async function reserveResultRoot(preferred: string): Promise<string> {
  await assertPlainLinkedPath(preferred);
  await mkdir(dirname(preferred), { recursive: true });
  for (let suffix = 1; suffix <= 10_000; suffix++) {
    const candidate = suffix === 1 ? preferred : `${preferred} (${suffix})`;
    await assertPlainLinkedPath(candidate);
    try {
      await mkdir(candidate);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error("사용 가능한 결과물 폴더 이름이 없습니다.");
}

export async function copyVerifiedLinkedFile(
  source: string,
  target: string,
  sha256: string,
) {
  await assertPlainLinkedPath(source);
  await assertPlainLinkedPath(target);
  if ((await fingerprintFile(source)).sha256 !== sha256)
    throw new Error(
      `앱 밖에서 변경된 파일을 보존했습니다. 폴더를 정리하지 않았습니다: ${source}`,
    );
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target, constants.COPYFILE_EXCL);
  if ((await fingerprintFile(target)).sha256 !== sha256)
    throw new Error(`결과물 복사 검증에 실패했습니다: ${target}`);
}

/** Non-recursive, bounded pruning: unrelated files keep their directories alive. */
export async function pruneLinkedResultParents(
  start: string,
  dataRoot: string,
) {
  const boundary = resolve(dataRoot, "results");
  for (
    let path = resolve(start);
    path !== boundary && isPathInside(boundary, path);
    path = dirname(path)
  ) {
    await assertPlainLinkedPath(path);
    try {
      await rmdir(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") continue;
      if (code === "ENOTEMPTY" || code === "EEXIST") return;
      throw error;
    }
  }
}

export async function removeVerifiedLinkedFile(
  root: string,
  path: string,
  sha256: string,
) {
  const absolute = resolvePathInside(root, path);
  await assertPlainLinkedPath(absolute);
  if (!(await linkedPathExists(absolute))) return false;
  if ((await fingerprintFile(absolute)).sha256 !== sha256) return true;
  await unlink(absolute);
  return false;
}

export function relocationJournalDirectory(dataRoot: string) {
  return join(dataRoot, "linked-relocations");
}
