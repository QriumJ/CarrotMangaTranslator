import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkflowSessions } from "../src/main/pageWorkflow/pageWorkflowSessions";
import { createPageWorkflowRuntime } from "../src/main/pageWorkflow/pageWorkflowRuntime";
import { translateWorkflowPage } from "../src/main/pageWorkflow/pageWorkflowTranslation";
import { executePageWorkflow } from "../src/main/application/pageWorkflowService";
import { createPageWorkflowPlan } from "../src/shared/pageWorkflowTypes";
import { makePage, makeChapter } from "./helpers/workspacePointerFixtures";
import {
  loadPipeline,
  basePipelineOptions,
  cleanupPipelineTempDirs,
  makeEmptyWorkContext,
} from "./helpers/wholePagePipelineHarness";
import { buildBaseOptions } from "../src/main/pipeline/options";
import type { PageWorkflowRuntimeContext } from "../src/main/pageWorkflow/pageWorkflowRuntimeTypes";
import type { MangaPage } from "../src/shared/libraryTypes";
import type { TranslationRuntimePort } from "../src/main/pipeline/translationRuntimePort";

afterEach(cleanupPipelineTempDirs);

async function fixture() {
  const h = await loadPipeline();
  const settings = await h.dependencies.settings.getAppSettings();
  settings.ocr.pipeline = "hayai";
  const options = basePipelineOptions([], []);
  const base = buildBaseOptions(
    "test",
    options.runPaths.runDir,
    settings,
    h.dependencies.paths,
  );
  return { ...h, settings, options, base };
}

describe("workflow process ownership", () => {
  it.each(["endpoint", "ocr"])(
    "waits for an in-flight %s acquisition during final disposal",
    async (kind) => {
      const h = await fixture();
      let release: () => void = () => {
        throw new Error("not started");
      };
      let ready: () => void = () => {};
      const started = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const dispose = vi.fn(async () => undefined);
      const collect = vi.fn(async () => ({ hints: [], diagnostics: [] }));
      const sessions = createWorkflowSessions({
        ...h.dependencies.runtime,
        startEndpointSession: async () => {
          ready();
          await pending;
          return {
            handle: { baseUrl: "local", child: null, startedByScript: true },
            dispose,
          };
        },
        startPreparedHayaiSession: async () => {
          ready();
          await pending;
          return { collect, dispose };
        },
      });
      const request =
        kind === "endpoint"
          ? sessions.runtime.startEndpointSession(h.base)
          : sessions.runtime.collectPreparedHayaiHints(h.base);
      const rejected = expect(request).rejects.toMatchObject({
        nonRetriable: true,
      });
      await started;
      const closing = sessions.dispose();
      release();
      await Promise.all([closing, rejected]);
      await sessions.dispose();
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(collect).not.toHaveBeenCalled();
    },
  );

  it("reuses an endpoint through actual per-page pipelines while refreshing saved context", async () => {
    const h = await fixture();
    const sessions = createWorkflowSessions(h.dependencies.runtime);
    const pages = [1, 2, 3].map((i) => ({
      ...makePage({
        blockPatch: { sourceText: `原文${i}`, translatedText: "" },
      }),
      id: `p${i}`,
    }));
    const chapter = { ...makeChapter(pages[0]), pages };
    const context: PageWorkflowRuntimeContext = {
      runId: "test",
      plan: { ...createPageWorkflowPlan(["translate"]), cumulative: false },
      rules: {},
      settings: h.settings,
      paths: h.dependencies.paths,
      dependencies: { ...h.dependencies, runtime: sessions.runtime },
      signal: h.options.signal,
      emit: vi.fn(),
      runPaths: async () => h.options.runPaths,
      decodeImage: async () => null,
    };
    const readContext = vi.fn(async () => ({
      ...makeEmptyWorkContext(),
      workTitle: "Test",
    }));
    try {
      for (const page of pages) {
        const result = await translateWorkflowPage(
          context,
          chapter,
          page,
          readContext,
        );
        expect(result.analysisStatus).toBe("completed");
        expect(result.blocks[0].translatedText).not.toBe("");
      }
      expect(readContext).toHaveBeenCalledTimes(3);
      expect(h.runtime.startEndpointSession).toHaveBeenCalledTimes(1);
      expect(h.runtime.disposeEndpoint).not.toHaveBeenCalled();
    } finally {
      await sessions.close();
    }
    expect(h.runtime.disposeEndpoint).toHaveBeenCalledTimes(1);
  });

  it("borrows one translation endpoint across pages and closes it at the stage boundary", async () => {
    const h = await fixture();
    const session = createWorkflowSessions(h.dependencies.runtime);
    const first = await session.runtime.startEndpointSession(h.base);
    await first.dispose();
    const second = await session.runtime.startEndpointSession(h.base);
    expect(second.handle).toBe(first.handle);
    expect(h.runtime.startEndpointSession).toHaveBeenCalledTimes(1);
    expect(h.runtime.disposeEndpoint).not.toHaveBeenCalled();
    await session.close();
    await session.close();
    expect(h.runtime.disposeEndpoint).toHaveBeenCalledTimes(1);
    await session.runtime.startEndpointSession(h.base);
    expect(h.runtime.startEndpointSession).toHaveBeenCalledTimes(2);
    await session.close();
  });

  it("restarts an endpoint that exited between pages", async () => {
    const h = await fixture();
    const child = { exitCode: null as number | null, signalCode: null };
    const start = vi.fn(async () => ({
      handle: { baseUrl: "local", child, startedByScript: true },
      dispose: h.runtime.disposeEndpoint,
    }));
    const sessions = createWorkflowSessions({
      ...h.dependencies.runtime,
      startEndpointSession: start,
    });
    await sessions.runtime.startEndpointSession(h.base);
    child.exitCode = 1;
    await sessions.runtime.startEndpointSession(h.base);
    expect(start).toHaveBeenCalledTimes(2);
    expect(h.runtime.disposeEndpoint).toHaveBeenCalledTimes(1);
    await sessions.close();
  });

  it("fails closed after process cleanup fails", async () => {
    const h = await fixture();
    h.runtime.disposeEndpoint.mockRejectedValue(new Error("still alive"));
    const sessions = createWorkflowSessions(h.dependencies.runtime);
    await sessions.runtime.startEndpointSession(h.base);
    await expect(sessions.close()).rejects.toMatchObject({
      nonRetriable: true,
    });
    await expect(
      sessions.runtime.startEndpointSession(h.base),
    ).rejects.toMatchObject({ nonRetriable: true });
    await expect(sessions.close()).rejects.toThrow("종료");
    expect(h.runtime.startEndpointSession).toHaveBeenCalledTimes(1);
  });

  it.each(["success", "page-error", "cancel"])(
    "saves OCR pages before the next request: %s",
    async (mode) => {
      const h = await fixture();
      const controller = new AbortController();
      const pages = [1, 2, 3].map((i) => ({
        ...makePage({ blockPatch: { sourceText: "", translatedText: "" } }),
        id: `p${i}`,
      }));
      let chapter = { ...makeChapter(pages[0]), pages };
      const saved: string[] = [];
      const closed = vi.fn(async () => undefined);
      const collect = vi.fn(async (options) => {
        if (options.pageId === "p2") {
          expect(saved).toContain("p1:completed");
          if (mode === "page-error") throw new Error("bad page");
          if (mode === "cancel") {
            controller.abort();
            controller.signal.throwIfAborted();
          }
        }
        return {
          hints: [{ id: 1, ocrText: String(options.pageId) }],
          diagnostics: [],
        };
      });
      const start = vi.fn(async () => ({ collect, dispose: closed }));
      const runtimePort: TranslationRuntimePort = {
        ...h.dependencies.runtime,
        startPreparedHayaiSession: start,
      };
      const context: PageWorkflowRuntimeContext = {
        runId: "test",
        plan: createPageWorkflowPlan(["ocr"]),
        rules: {},
        settings: h.settings,
        paths: h.dependencies.paths,
        dependencies: { ...h.dependencies, runtime: runtimePort },
        signal: controller.signal,
        emit: vi.fn(),
        runPaths: async () => h.options.runPaths,
        decodeImage: async () => null,
      };
      const runtime = createPageWorkflowRuntime(context);
      const result = await executePageWorkflow(
        {
          ...context,
          selection: [
            { chapterId: chapter.id, pageIds: pages.map((p) => p.id) },
          ],
        },
        {
          ...runtime,
          readChapter: async () => structuredClone(chapter),
          acquirePage: async (_, id) =>
            chapter.pages.find((p) => p.id === id) as MangaPage,
          releasePage: vi.fn(),
          progress: vi.fn(),
          isFatal: () => false,
          save: async (_, before, after) => {
            saved.push(`${after.id}:${after.pageWorkflow?.steps.ocr?.status}`);
            chapter = {
              ...chapter,
              pages: chapter.pages.map((p) => (p.id === before.id ? after : p)),
            };
          },
        },
      );
      await runtime.dispose();
      expect(result.status).toBe(
        mode === "success"
          ? "completed"
          : mode === "cancel"
            ? "cancelled"
            : "partial",
      );
      expect(start).toHaveBeenCalledTimes(mode === "page-error" ? 2 : 1);
      expect(closed).toHaveBeenCalledTimes(mode === "page-error" ? 2 : 1);
      expect(saved).toContain("p1:completed");
      if (mode !== "cancel") expect(saved).toContain("p3:completed");
      else expect(saved).toEqual(["p1:completed"]);
    },
  );
});
