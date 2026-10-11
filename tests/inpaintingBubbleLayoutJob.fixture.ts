import { vi } from "vitest";
import { resolveDefaultAppSettings } from "../src/main/appSettings";
import type { AppPaths } from "../src/main/appPaths";
import type { InpaintingRevisionChange } from "../src/main/inpainting/inpaintingRevisionStore";
import { ActiveJobStore } from "../src/main/jobs/activeJob";
import type { InpaintingJobContext } from "../src/main/jobs/inpaintingJobTypes";
import {
  productionInpaintingJobRuntime,
  type InpaintingJobRuntime,
} from "../src/main/jobs/inpaintingJobRuntime";
import type { ChapterSnapshot, MangaPage } from "../src/shared/libraryTypes";
const CHAPTER_ID = "11111111-1111-4111-8111-111111111111";
const PAGE_ID = "22222222-2222-4222-8222-222222222222";
const BLOCK_ID = "block-1";
const TRANSACTION_ID = "33333333-3333-4333-8333-333333333333";
export function makeRuntime(
  chapters: Map<string, ChapterSnapshot>,
  createBubbleLayoutRunner: NonNullable<
    InpaintingJobRuntime["createBubbleLayoutRunner"]
  >,
): InpaintingJobRuntime {
  const settings = resolveDefaultAppSettings();
  const savePages = vi.fn<InpaintingJobRuntime["savePages"]>(
    async (chapterId, pages) => {
      const current = chapters.get(chapterId);
      if (!current) {
        throw new Error("missing chapter");
      }
      const updates = new Map(pages.map((page) => [page.id, page]));
      const saved = {
        ...current,
        pages: current.pages.map((page) => updates.get(page.id) ?? page),
      };
      chapters.set(chapterId, saved);
      return saved;
    },
  );
  return {
    acquireEngine: vi.fn(async () => ({
      engine: {
        model: "flux-klein",
        backend: "cpu",
        runtimePath: "C:\\runtime\\runner.exe",
        runRootDir: "C:\\runtime\\runs",
        inpaint: vi.fn(),
        dispose: vi.fn(),
      },
      release: vi.fn(),
    })) as InpaintingJobRuntime["acquireEngine"],
    createBubbleLayoutRunner,
    disposeBubbleLayoutSessions: vi.fn(async () => true),
    emitEvent: (jobs, _window, event) => {
      jobs.updateLastEvent(event.id, event);
    },
    getSettings: vi.fn(async () => settings),
    inpaintDrawnPage: vi.fn(async () => {
      throw new Error("unexpected drawn inpainting");
    }),
    inpaintPatternPage: vi.fn(async (page) => ({
      page: {
        ...page,
        inpaintedImagePath: `${page.imagePath}.inpainted.png`,
      },
      blocksErased: 1,
    })),
    logError: vi.fn(),
    openPageTimingSession: productionInpaintingJobRuntime.openPageTimingSession,
    openChapter: vi.fn(async (chapterId) => {
      const chapter = chapters.get(chapterId);
      if (!chapter) {
        throw new Error("missing chapter");
      }
      return chapter;
    }),
    savePages,
  };
}

export function makeContext(
  changes: InpaintingRevisionChange[],
): InpaintingJobContext {
  return {
    appPaths: makeAppPaths(),
    jobs: new ActiveJobStore({ error: vi.fn(), info: vi.fn() }),
    getMainWindow: () => null,
    decodeImage: async () => null,
    inpaintingRevisionStore: {
      beginTransaction: () => TRANSACTION_ID,
      addChange: (_transactionId, change) => {
        changes.push(structuredClone(change));
        return true;
      },
      removeChange: async () => undefined,
      discardIfEmpty: () => undefined,
      getReference: () => ({ transactionId: TRANSACTION_ID }),
      getRetainedArtifactPaths: () => [],
    },
  };
}

function makeAppPaths(): AppPaths {
  return {
    isPackaged: false,
    repoRoot: "C:\\repo",
    executableDir: "C:\\repo",
    resourcesDir: "C:\\repo\\resources",
    dataRoot: "C:\\repo",
    settingsPath: "C:\\repo\\settings.json",
    libraryDir: "C:\\repo\\library",
    fontsDir: "C:\\repo\\fonts",
    logsDir: "C:\\repo\\logs",
    logFile: "C:\\repo\\logs\\app.log",
    runtimeDir: "C:\\repo\\runtime",
    toolsDir: "C:\\repo\\tools",
    ocrRuntimeDir: "C:\\repo\\ocr",
    llamaRuntimeDir: "C:\\repo\\llama",
    llamaServerPath: "C:\\repo\\llama\\server.exe",
  };
}

export function makePage(): MangaPage {
  return {
    id: PAGE_ID,
    name: "page.png",
    imagePath: "C:\\library\\page.png",
    dataUrl: "data:image/png;base64,AA==",
    width: 1000,
    height: 1000,
    blocks: [
      {
        id: BLOCK_ID,
        type: "nonsolid",
        bbox: { x: 50, y: 60, w: 200, h: 220 },
        sourceText: "source",
        translatedText: "translated text",
        confidence: 1,
        sourceDirection: "horizontal",
        renderDirection: "horizontal",
        fontSizePx: 16,
        lineHeight: 1.2,
        textAlign: "center",
        textColor: "#000000",
        backgroundColor: "#ffffff",
        opacity: 1,
      },
    ],
    analysisStatus: "completed",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

export function makeChapter(page: MangaPage): ChapterSnapshot {
  return {
    id: CHAPTER_ID,
    workId: "work-1",
    title: "chapter",
    sourceKind: "images",
    status: "completed",
    pageOrder: [page.id],
    pages: [page],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
