import { describe, expect, it } from "vitest";
import { AppActivityGate } from "../src/main/appActivityGate";
import { ActiveJobStore } from "../src/main/jobs/activeJob";
import { translationActivityResources } from "../src/main/jobs/jobActivityResources";
import { assertJobPagesAvailable } from "../src/main/jobs/jobPageOwnership";
import {
  assertModelCleanupComplete,
  ModelCleanupError,
  releaseModelResource,
} from "../src/main/runtimeSupport/modelCleanupBarrier";
import { LocalInferenceSection } from "../src/main/runtimeSupport/localInferenceSection";
import {
  isModelRuntimeBlocked,
  modelRuntimeResource,
  type AppActivityState,
} from "../src/shared/appActivityTypes";
import { pageWorkflowNeedsExclusiveModel } from "../src/shared/pageWorkflowPolicy";
import type { PageWorkflowStage } from "../src/shared/pageWorkflowStages";
import { createPageWorkflowPlan } from "../src/shared/pageWorkflowTypes";
import type { AppSettings } from "../src/shared/settingsTypes";

const settings = (modelProvider: AppSettings["modelProvider"]) =>
  ({ modelProvider }) as AppSettings;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const job = (id: string, exclusive: boolean) => ({
  id,
  category: "job" as const,
  kind: "gemma-analysis",
  mutatesLibrary: true,
  blocksQuit: true,
  resources: [modelRuntimeResource(exclusive)],
});

describe("shared model runtime", () => {
  it("lets API/Codex jobs overlap while local models stay exclusive", () => {
    const gate = new AppActivityGate();
    const first = gate.acquire(job("codex-1", false));
    const second = gate.acquire(job("codex-2", false));
    expect(() => gate.acquire(job("gemma", true))).toThrow(/APP_ACTIVITY_BUSY/);
    first.release();
    second.release();
    const gemma = gate.acquire(job("gemma", true));
    expect(() => gate.acquire(job("codex-3", false))).toThrow(
      /APP_ACTIVITY_BUSY/,
    );
    gemma.release();
  });

  it("declares exclusivity from the provider and local erasure", () => {
    expect(translationActivityResources(settings("gemma"))[0]).toEqual(
      modelRuntimeResource(true),
    );
    expect(translationActivityResources(settings("openai-api"))).toEqual([
      modelRuntimeResource(false),
    ]);
    expect(translationActivityResources(settings("openai-codex"))).toEqual([
      modelRuntimeResource(false),
      { kind: "codex-auth", scope: "*", access: "read" },
    ]);
    expect(
      translationActivityResources(settings("openai-codex"), false, true)[0],
    ).toEqual(modelRuntimeResource(true));
  });

  it("marks only Gemma translation and local erasure workflows exclusive", () => {
    const plan = (
      stages: PageWorkflowStage[],
      erasureEngine: "local" | "codex" = "local",
    ) => ({ plan: { ...createPageWorkflowPlan(stages), erasureEngine } });
    const codex = { modelProvider: "openai-codex" };
    expect(
      pageWorkflowNeedsExclusiveModel(plan(["ocr", "translate"]), codex),
    ).toBe(false);
    expect(
      pageWorkflowNeedsExclusiveModel(plan(["translate"]), {
        modelProvider: "gemma",
      }),
    ).toBe(true);
    expect(pageWorkflowNeedsExclusiveModel(plan(["erase"]), codex)).toBe(true);
    expect(
      pageWorkflowNeedsExclusiveModel(plan(["erase"], "codex"), codex),
    ).toBe(false);
  });

  it("reports renderer admission against exclusive and shared holders", () => {
    const state = (access: "read" | "write"): AppActivityState => ({
      version: 1,
      pages: [],
      activities: [
        {
          ...job("running", access === "write"),
          startedAt: 0,
        },
      ],
    });
    expect(isModelRuntimeBlocked(state("read"), false)).toBe(false);
    expect(isModelRuntimeBlocked(state("read"), true)).toBe(true);
    expect(isModelRuntimeBlocked(state("write"), false)).toBe(true);
    expect(isModelRuntimeBlocked(null, true)).toBe(false);
  });

  it("admits shared work during an in-flight release but not after a failed one", async () => {
    const resource = {};
    let fail!: (error: Error) => void;
    const pending = releaseModelResource(
      resource,
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    );
    const observed = expect(pending).rejects.toBeInstanceOf(ModelCleanupError);
    await Promise.resolve();
    expect(() =>
      assertModelCleanupComplete([modelRuntimeResource(false)]),
    ).not.toThrow();
    expect(() =>
      assertModelCleanupComplete([modelRuntimeResource(true)]),
    ).toThrow(ModelCleanupError);
    fail(new Error("release failed"));
    await observed;
    expect(() =>
      assertModelCleanupComplete([modelRuntimeResource(false)]),
    ).toThrow(ModelCleanupError);
    await releaseModelResource(resource, async () => {});
    expect(() =>
      assertModelCleanupComplete([modelRuntimeResource(false)]),
    ).not.toThrow();
  });

  it("refuses pages another run has queued before taking any of them", () => {
    const jobs = new ActiveJobStore();
    jobs.start({
      id: "first",
      kind: "gemma-analysis",
      abortController: new AbortController(),
      resources: [modelRuntimeResource(false)],
    });
    jobs.start({
      id: "second",
      kind: "gemma-analysis",
      abortController: new AbortController(),
      resources: [modelRuntimeResource(false)],
    });
    jobs.pageHandoffs.reserve("first", "chapter", ["p1", "p2"]);
    expect(() =>
      assertJobPagesAvailable(jobs, "second", "chapter", ["p2", "p3"]),
    ).toThrow(/다른 작업이 처리 중인 페이지/);
    expect(() =>
      assertJobPagesAvailable(jobs, "second", "chapter", ["p3"]),
    ).not.toThrow();
    expect(() =>
      assertJobPagesAvailable(jobs, "first", "chapter", ["p1"]),
    ).not.toThrow();
    jobs.clearIfCurrent("first");
    expect(() =>
      assertJobPagesAvailable(jobs, "second", "chapter", ["p2"]),
    ).not.toThrow();
    jobs.clearIfCurrent("second");
  });
});

describe("LocalInferenceSection", () => {
  it("runs one owner's stages at a time, in FIFO order", async () => {
    const section = new LocalInferenceSection();
    const order: string[] = [];
    const gateA = deferred();
    const a = section.run(
      async () => {
        order.push("a:start");
        await gateA.promise;
        order.push("a:end");
      },
      undefined,
      "job-a",
    );
    const b = section.run(
      async () => {
        order.push("b");
      },
      undefined,
      "job-b",
    );
    const c = section.run(
      async () => {
        order.push("c");
      },
      undefined,
      "job-c",
    );
    await Promise.resolve();
    expect(order).toEqual(["a:start"]);
    expect(section.waiting).toBe(2);
    gateA.resolve();
    await Promise.all([a, b, c]);
    expect(order).toEqual(["a:start", "a:end", "b", "c"]);
    expect(section.activeOwner).toBeNull();
  });

  it("shares an admitted section with the same owner and nested stages", async () => {
    const section = new LocalInferenceSection();
    const hold = deferred();
    const outer = section.run(
      async () => {
        await section.run(async () => {}, undefined, "job-a");
        await hold.promise;
      },
      undefined,
      "job-a",
    );
    await Promise.resolve();
    let parallelRan = false;
    await section.run(
      async () => {
        parallelRan = true;
      },
      undefined,
      "job-a",
    );
    expect(parallelRan).toBe(true);
    hold.resolve();
    await outer;
  });

  it("nests stages that run outside any job", async () => {
    const section = new LocalInferenceSection();
    const result = await section.run(() => section.run(async () => "nested"));
    expect(result).toBe("nested");
    expect(section.activeOwner).toBeNull();
  });

  it("drops an aborted waiter without disturbing the active owner", async () => {
    const section = new LocalInferenceSection();
    const hold = deferred();
    const active = section.run(() => hold.promise, undefined, "job-a");
    const controller = new AbortController();
    const waiting = section.run(async () => "late", controller.signal, "job-b");
    controller.abort();
    await expect(waiting).rejects.toBeDefined();
    expect(section.waiting).toBe(0);
    expect(section.activeOwner).toBe("job-a");
    hold.resolve();
    await active;
    expect(section.activeOwner).toBeNull();
  });
});
