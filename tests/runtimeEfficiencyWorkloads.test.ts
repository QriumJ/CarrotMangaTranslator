import { afterEach, expect, it, vi } from "vitest";
import { createPageWorkflowRuntime } from "../src/main/pageWorkflow/pageWorkflowRuntime";
import {
  acquireInpaintingEngine,
  type InpaintingEnginePoolDependencies,
} from "../src/main/inpainting/inpaintingEnginePool";
import { executePageWorkflow } from "../src/main/application/pageWorkflowService";
import { createPageWorkflowPlan } from "../src/shared/pageWorkflowTypes";
import { makeChapter, makePage } from "./helpers/workspacePointerFixtures";
import {
  loadPipeline,
  basePipelineOptions,
  cleanupPipelineTempDirs,
} from "./helpers/wholePagePipelineHarness";

afterEach(cleanupPipelineTempDirs);

it.each([false, true])(
  "owns one erasure model across native workflow pages (failure=%s)",
  async (fail) => {
    const f = await loadPipeline();
    const pages = ["one", "two", "three"].map((id) => ({ ...makePage(), id }));
    const chapter = {
      ...makeChapter(pages[0]),
      pages,
      pageOrder: pages.map((page) => page.id),
    };
    const input = basePipelineOptions(pages, []);
    const plan = createPageWorkflowPlan(["erase"]);
    const runtime = createPageWorkflowRuntime({
      runId: "reuse",
      plan,
      rules: {},
      paths: f.dependencies.paths,
      settings: await f.dependencies.settings.getAppSettings(),
      dependencies: f.dependencies,
      signal: input.signal,
      emit: vi.fn(),
      decodeImage: async () => null,
      runPaths: async () => input.runPaths,
    });
    const release = vi.fn(async () => {});
    const acquire = vi.fn(async () => ({
      engine: {
        model: "flux-klein" as const,
        runtimePath: "fixture",
        runRootDir: "fixture",
        backend: "fixture",
        inpaint: vi.fn(async () => {}),
        dispose: vi.fn(async () => {}),
      },
      release,
    }));
    const dispose = vi.fn(async () => true);
    const engines: InpaintingEnginePoolDependencies = {
      acquireFlux: acquire,
      acquireKoharu: acquire,
      disposeFlux: dispose,
      disposeKoharu: async () => false,
      totalMemoryBytes: () => 32 * 1024 ** 3,
    };
    const result = await executePageWorkflow(
      {
        runId: "reuse",
        plan,
        selection: [{ chapterId: chapter.id, pageIds: chapter.pageOrder }],
        signal: input.signal,
      },
      {
        ...runtime,
        readChapter: async () => chapter,
        acquirePage: async () => {},
        releasePage: vi.fn(),
        save: async () => {},
        progress: vi.fn(),
        isFatal: () => false,
        execute: async (_stage, _chapter, page) => {
          const lease = await acquireInpaintingEngine(
            {
              appPaths: f.dependencies.paths,
              model: "flux-klein",
              signal: input.signal,
            },
            engines,
          );
          await lease.release();
          expect(dispose).not.toHaveBeenCalled();
          if (fail && page.id === "two") throw new Error("page failed");
          return page;
        },
      },
    );
    await runtime.dispose();
    expect(result.status).toBe(fail ? "partial" : "completed");
    expect(acquire).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  },
);
