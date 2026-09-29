import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  LibraryChapter,
  LibraryWork,
} from "../../src/shared/libraryTypes";
import { makePngImage as makePngHeader } from "./imageFixtures";

export function makeChapter(
  rootDir: string,
  chapterId: string,
  title: string,
  pageId: string,
  blockId: string,
): LibraryChapter {
  return {
    id: chapterId,
    workId: "work-1",
    title,
    sourceKind: "folder",
    status: "completed",
    pageOrder: [pageId],
    pages: [
      {
        id: pageId,
        name: "001.png",
        imagePath: join(
          rootDir,
          "works",
          "work-1",
          "chapters",
          chapterId,
          "pages",
          `001-${pageId}.png`,
        ),
        width: 100,
        height: 120,
        blocks: [
          {
            id: blockId,
            type: "nonsolid",
            bbox: { x: 10, y: 10, w: 100, h: 100 },
            bboxSpace: "normalized_1000",
            sourceText: "こんにちは",
            translatedText: "안녕",
            confidence: 0.95,
            sourceDirection: "vertical",
            renderDirection: "vertical",
            fontSizePx: 18,
            lineHeight: 1.2,
            textAlign: "center",
            textColor: "#111111",
            backgroundColor: "#ffffff",
            opacity: 0.8,
            autoFitText: true,
          },
        ],
        analysisStatus: "completed",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

export async function seedLibrary(rootDir: string): Promise<void> {
  const work: LibraryWork = {
    id: "work-1",
    title: "원본 작품",
    chapterOrder: ["chapter-a", "chapter-b"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  await mkdir(
    join(rootDir, "works", work.id, "chapters", "chapter-a", "pages"),
    { recursive: true },
  );
  await mkdir(
    join(rootDir, "works", work.id, "chapters", "chapter-b", "pages"),
    { recursive: true },
  );
  await mkdir(
    join(rootDir, "works", work.id, "chapters", "chapter-a", "runs", "run-1"),
    { recursive: true },
  );
  await writeJson(join(rootDir, "index.json"), { workOrder: [work.id] });
  await writeJson(join(rootDir, "works", work.id, "work.json"), work);
  await writeFile(
    join(
      rootDir,
      "works",
      work.id,
      "chapters",
      "chapter-a",
      "pages",
      "001-page-a.png",
    ),
    makePngHeader(100, 120),
  );
  await writeFile(
    join(
      rootDir,
      "works",
      work.id,
      "chapters",
      "chapter-b",
      "pages",
      "001-page-b.png",
    ),
    makePngHeader(100, 120),
  );
  await writeJson(
    join(rootDir, "works", work.id, "chapters", "chapter-a", "chapter.json"),
    makeChapter(rootDir, "chapter-a", "1화", "page-a", "block-a"),
  );
  await writeJson(
    join(rootDir, "works", work.id, "chapters", "chapter-b", "chapter.json"),
    makeChapter(rootDir, "chapter-b", "2화", "page-b", "block-b"),
  );
  await writeFile(
    join(
      rootDir,
      "works",
      work.id,
      "chapters",
      "chapter-a",
      "runs",
      "run-1",
      "debug.txt",
    ),
    "skip",
  );
}

export async function writeJson(path: string, payload: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
