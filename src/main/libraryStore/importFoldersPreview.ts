import { lstat, realpath } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ImportChapterDraft,
  PreparedImportPreview,
} from "../../shared/importTypes";
import { sanitizeOutputPathSegment } from "../../shared/outputPathSegment";
import { throwIfAborted } from "../abortSignal";
import { prepareArchiveFolderImportPreview } from "./importPreparedPreview";
import { inspectImportImageFiles } from "./importImages";
import {
  listImageFiles,
  MAX_NESTED_IMAGE_FOLDERS,
  MAX_NESTED_IMAGE_FOLDER_PAGES,
} from "./importSources";
import type { ImportSourceProgress } from "./importSourceRunner";
import { tMain } from "./localization";

/** One owned preview session and cleanup for all native picker roots. */
export async function prepareFoldersImportPreview(
  paths: string[],
  signal?: AbortSignal,
  onProgress?: (progress: ImportSourceProgress) => void,
): Promise<PreparedImportPreview> {
  const roots = await distinctRoots(paths, signal);
  const prepared: PreparedImportPreview[] = [];
  const chapters: ImportChapterDraft[] = [];
  const excludedPages: NonNullable<
    PreparedImportPreview["preview"]["excludedPages"]
  > = [];
  const aliases = rootAliases(roots);
  try {
    for (const [index, root] of roots.entries()) {
      throwIfAborted(signal);
      const item = await prepareArchiveFolderImportPreview(
        root,
        signal,
        onProgress,
        { allowEmpty: true },
      );
      prepared.push(item);
      excludedPages.push(...(item.preview.excludedPages ?? []));
      const own = await previewRootImages(root);
      excludedPages.push(...own.excludedPages);
      const ownChapters = own.chapters;
      for (const chapter of [...ownChapters, ...item.preview.chapters]) {
        const prefix =
          roots.length > 1 || ownChapters.includes(chapter)
            ? aliases[index]
            : undefined;
        chapters.push(prefix ? withOutputRoot(chapter, prefix) : chapter);
      }
      if (
        chapters.length > MAX_NESTED_IMAGE_FOLDERS ||
        chapters.reduce((sum, chapter) => sum + chapter.pages.length, 0) >
          MAX_NESTED_IMAGE_FOLDER_PAGES
      )
        throw new Error(tMain("import.errors.tooManySources"));
    }
    throwIfAborted(signal);
    assertFoldersUsable(chapters, excludedPages);
    return {
      preview: {
        mode: "batch",
        sourceKind: "zip-folder",
        suggestedWorkTitle: basename(roots[0]),
        chapters,
        ...(excludedPages.length ? { excludedPages } : {}),
      },
      cleanup: () => cleanupFolders(prepared),
    };
  } catch (error) {
    try {
      await cleanupFolders(prepared);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Folder preview and cleanup failed.",
        { cause: cleanupError },
      );
    }
    throw error;
  }
}

function assertFoldersUsable(
  chapters: ImportChapterDraft[],
  excluded: NonNullable<PreparedImportPreview["preview"]["excludedPages"]>,
) {
  if (!chapters.length && excluded[0])
    throw new Error(
      tMain("import.errors.invalidImageHeader", {
        file: `${excluded[0].chapterTitle} / ${excluded[0].pageName}`,
      }),
    );
}

async function previewRootImages(root: string) {
  const own = await inspectImportImageFiles(await listImageFiles(root));
  const title = basename(root);
  const chapters: ImportChapterDraft[] = own.filePaths.length
    ? [
        {
          draftId: randomUUID(),
          title,
          sourceKind: "folder",
          pages: own.filePaths.map((file) => ({
            name: basename(file),
            sourcePath: file,
            sourceKind: "file",
            sourceFileName: basename(file),
            sourceRelativePath: relative(root, file),
          })),
        },
      ]
    : [];
  const excludedPages = own.excludedFilePaths.map((file) => ({
    chapterTitle: title,
    pageName: basename(file),
    reason: "invalid-image-header" as const,
  }));
  return { chapters, excludedPages };
}

async function distinctRoots(
  paths: string[],
  signal?: AbortSignal,
): Promise<string[]> {
  if (!paths.length || paths.length > MAX_NESTED_IMAGE_FOLDERS)
    throw new Error(tMain("import.errors.tooManySources"));
  const unique = new Map<string, string>();
  for (const input of paths) {
    throwIfAborted(signal);
    const path = resolve(input);
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error("Select ordinary source folders, not directory links.");
    const canonical = await realpath(path);
    unique.set(pathKey(canonical), canonical);
  }
  const values = [...unique.values()].sort(
    (a, b) => a.localeCompare(b, "en", { numeric: true }) || a.localeCompare(b),
  );
  return values.filter(
    (path) =>
      !values.some(
        (parent) =>
          parent !== path &&
          pathKey(path).startsWith(
            pathKey(parent.endsWith(sep) ? parent : `${parent}${sep}`),
          ),
      ),
  );
}

function pathKey(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function rootAliases(roots: string[]): string[] {
  const used = new Set<string>();
  return roots.map((root) => {
    const base = sanitizeOutputPathSegment(basename(root), "folder");
    let alias = base;
    let suffix = 1;
    while (used.has(alias.normalize("NFC").toLowerCase()))
      alias = `${base.slice(0, 65)} (${++suffix})`;
    used.add(alias.normalize("NFC").toLowerCase());
    return alias;
  });
}

function withOutputRoot(
  chapter: ImportChapterDraft,
  root: string,
): ImportChapterDraft {
  return {
    ...chapter,
    pages: chapter.pages.map((page) => ({
      ...page,
      sourceFileName:
        page.sourceFileName ?? basename(page.zipEntryName ?? page.name),
      sourceRelativePath: join(
        root,
        page.sourceRelativePath ??
          join(chapter.title, page.zipEntryName ?? page.name),
      ),
    })),
  };
}

async function cleanupFolders(
  prepared: PreparedImportPreview[],
): Promise<void> {
  const results = await Promise.allSettled(
    prepared.map((item) => item.cleanup?.()),
  );
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  if (failures.length)
    throw new AggregateError(failures, "Folder preview cleanup failed.");
}
