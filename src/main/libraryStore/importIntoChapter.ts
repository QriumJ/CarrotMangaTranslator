import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type {
  CreateImportResult,
  ImportChapterDraft,
  ImportTarget,
} from "../../shared/importTypes";
import type { LibraryPageRecord } from "../../shared/libraryTypes";
import { throwIfAborted } from "../abortSignal";
import { hydrateChapter } from "./chapterSnapshots";
import {
  nextChapterUpdatedAt,
  reorderRecords,
  resolveChapterStatus,
} from "./chapterRecords";
import { ensureExistingWork, readChapterFile } from "./libraryFiles";
import { getWorksRoot } from "./libraryPaths";
import { readLibraryPageOrdering } from "./libraryPageOrdering";
import type { LibraryTransaction } from "./libraryTransaction";
import {
  stageChapterFile,
  stageStoryMemoryFile,
  stageWorkFile,
} from "./libraryTransactionFiles";
import { resolveReconciledStoryMemory } from "./workContextFiles";
import type { ImportImageRuntime } from "./importImageRuntime";
import { materializePageRecord } from "./importPageMaterialize";
import type { ZipArchiveReader } from "./zipSafety";

type ChapterTarget = Extract<ImportTarget, { mode: "chapter" }>;

export async function importIntoChapter(
  transaction: LibraryTransaction,
  target: ChapterTarget,
  drafts: ImportChapterDraft[],
  imageRuntime: ImportImageRuntime,
  signal?: AbortSignal,
): Promise<CreateImportResult> {
  await readTarget(target);
  const directory = await transaction.createPublishedDirectory(
    join(
      getWorksRoot(),
      target.workId,
      "chapters",
      target.chapterId,
      "pages",
      randomUUID(),
    ),
  );
  const pages = await materializePages(drafts, directory, imageRuntime, signal);
  const result: CreateImportResult = {
    workId: target.workId,
    chapterIds: [target.chapterId],
    addedPageIds: pages.map((page) => page.id),
  };
  transaction.beforePublish(async () => {
    throwIfAborted(signal);
    // Re-read under the publication lock: edits made during decoding remain authoritative.
    const { work, chapter } = await readTarget(target);
    const existing = reorderRecords(chapter.pages, chapter.pageOrder);
    const index = insertionIndex(target, existing);
    const combined = [
      ...existing.slice(0, index),
      ...pages,
      ...existing.slice(index),
    ];
    const updatedAt = nextChapterUpdatedAt(chapter);
    const next = {
      ...chapter,
      pages: combined,
      pageOrder: combined.map((page) => page.id),
      updatedAt,
      status: resolveChapterStatus(combined),
    };
    const ordering = await readLibraryPageOrdering(chapter);
    if (ordering.memory) {
      await stageStoryMemoryFile(
        transaction,
        resolveReconciledStoryMemory(ordering.memory, combined, updatedAt),
      );
    }
    await stageChapterFile(transaction, next);
    await stageWorkFile(transaction, { ...work, updatedAt });
    result.openedChapter = hydrateChapter(next);
    throwIfAborted(signal);
  });
  return result;
}

async function readTarget(target: ChapterTarget) {
  const work = await ensureExistingWork(target.workId);
  const chapter = await readChapterFile(target.workId, target.chapterId);
  if (!chapter || !work.chapterOrder.includes(target.chapterId)) {
    throw new Error("페이지를 추가할 화를 찾지 못했습니다.");
  }
  insertionIndex(target, chapter.pages);
  return { work, chapter };
}

function insertionIndex(
  target: ChapterTarget,
  pages: LibraryPageRecord[],
): number {
  const position = target.position;
  if (position.kind === "end") return pages.length;
  const index = pages.findIndex((page) => page.id === position.pageId);
  if (index < 0)
    throw new Error(
      "기준 페이지가 변경되었습니다. 추가 위치를 다시 선택해 주세요.",
    );
  return index + (position.kind === "after" ? 1 : 0);
}

async function materializePages(
  drafts: ImportChapterDraft[],
  directory: { stagingDirectory: string; finalDirectory: string },
  imageRuntime: ImportImageRuntime,
  signal?: AbortSignal,
) {
  const readers = new Map<string, ZipArchiveReader>();
  const pages: LibraryPageRecord[] = [];
  try {
    for (const draft of drafts) {
      for (const page of draft.pages) {
        // Imported batches can each start at 1. UUID filenames keep them distinct.
        const { storageStem: _storageStem, ...source } = page;
        pages.push(
          await materializePageRecord(
            source,
            {
              writePagesDirectory: directory.stagingDirectory,
              publishedPagesDirectory: directory.finalDirectory,
            },
            pages.length,
            readers,
            imageRuntime,
            signal,
          ),
        );
      }
    }
    return pages;
  } finally {
    for (const reader of readers.values()) reader.close();
  }
}
