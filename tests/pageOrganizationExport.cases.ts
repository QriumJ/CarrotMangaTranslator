import { it, expect, vi, type Mock } from "vitest";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  ChapterSnapshot,
  MangaPage,
  LibraryIndex,
} from "../src/shared/libraryTypes";
import type { IpcContext } from "../src/main/ipc/context";
import type { PageImageExportDependencies } from "../src/main/jobs/pageImageExportPorts";
import type { runPageImageExportJob as Run } from "../src/main/jobs/pageImageExportJobRunner";
type Fixture = {
  makeTempDir: () => Promise<string>;
  makeChapter: (
    id: string,
    title: string,
    pages: MangaPage[],
  ) => ChapterSnapshot;
  makePage: (id: string, name: string) => MangaPage;
  makeLibrary: (chapters: ChapterSnapshot[]) => LibraryIndex;
  makeContext: (root: string) => IpcContext;
  makeRasterPng: (
    width: number,
    height: number,
    rgba: [number, number, number, number],
  ) => Buffer;
  makeDependencies: (
    library: LibraryIndex,
    chapters: ChapterSnapshot[],
    overrides: {
      renderPage?: () => Promise<Buffer>;
      renderTransparentPage?: () => Promise<Buffer>;
      fileExists?: () => Promise<boolean>;
    },
  ) => { dependencies: PageImageExportDependencies; writePng: Mock };
  runPageImageExportJob: typeof Run;
};
export function registerPageOrganizationExportCases({
  makeTempDir,
  makeChapter,
  makePage,
  makeDependencies,
  makeLibrary,
  makeRasterPng,
  makeContext,
  runPageImageExportJob,
}: Fixture) {
  it.each(["png", "psd"] as const)(
    "uses exact edited names for %s and preserves legacy numbering",
    async (outputFormat) => {
      const outputParentDir = await makeTempDir();
      const chapter = makeChapter("chapter-1", "One", [
        { ...makePage("page-1", "표지.png"), outputBaseName: "표지" },
        makePage("page-2", "2.png"),
      ]);
      const harness = makeDependencies(makeLibrary([chapter]), [chapter], {
        renderPage: async () => makeRasterPng(10, 10, [255, 255, 255, 255]),
        renderTransparentPage: async () => makeRasterPng(10, 10, [0, 0, 0, 0]),
      });
      const result = await runPageImageExportJob({
        context: makeContext(outputParentDir),
        request: {
          workId: "work-1",
          selections: [{ chapterId: chapter.id, mode: "all" }],
          outputFormat,
          preserveSourceNames: false,
        },
        outputParentDir,
        id: "named-export",
        abortController: new AbortController(),
        emit: vi.fn(),
        dependencies: harness.dependencies,
      });
      expect((await readdir(join(result.outputDir, "001-One"))).sort()).toEqual(
        [`002-2.${outputFormat}`, `표지.${outputFormat}`],
      );
    },
  );

  it("rejects existing exact output names even when overwrite is requested", async () => {
    const outputParentDir = await makeTempDir();
    const chapter = makeChapter("chapter-1", "One", [
      { ...makePage("page-1", "표지.png"), outputBaseName: "표지" },
    ]);
    const harness = makeDependencies(makeLibrary([chapter]), [chapter], {
      fileExists: async () => true,
    });
    await expect(
      runPageImageExportJob({
        context: makeContext(outputParentDir),
        request: {
          workId: "work-1",
          selections: [{ chapterId: chapter.id, mode: "all" }],
          outputFormat: "png",
          collisionPolicy: "replace",
        },
        outputParentDir,
        id: "named-conflict",
        abortController: new AbortController(),
        emit: vi.fn(),
        dependencies: harness.dependencies,
      }),
    ).rejects.toThrow();
    expect(harness.writePng).not.toHaveBeenCalled();
  });
  it("rejects duplicate explicit names before exporting any page", async () => {
    const outputParentDir = await makeTempDir();
    const chapter = makeChapter(
      "chapter-1",
      "One",
      ["a", "b"].map((id) => ({
        ...makePage(id, "same.png"),
        outputBaseName: "same",
      })),
    );
    const harness = makeDependencies(makeLibrary([chapter]), [chapter], {});
    await expect(
      runPageImageExportJob({
        context: makeContext(outputParentDir),
        request: {
          workId: "work-1",
          selections: [{ chapterId: chapter.id, mode: "all" }],
          outputFormat: "png",
        },
        outputParentDir,
        id: "duplicate-name",
        abortController: new AbortController(),
        emit: vi.fn(),
        dependencies: harness.dependencies,
      }),
    ).rejects.toThrow("겹칩니다");
    expect(harness.writePng).not.toHaveBeenCalled();
  });
}
