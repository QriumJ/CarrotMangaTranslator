import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageWorkflowTimingRecorder } from "../src/main/pageWorkflow/pageWorkflowTimingRecorder";
import {
  readPageWorkflowTimings,
  workflowTimingPath,
  markWorkflowTimingActive,
} from "../src/main/pageWorkflow/pageWorkflowTimingStore";
import { createPageWorkflowPlan } from "../src/shared/pageWorkflowTypes";
import { makePage, makeChapter } from "./helpers/workspacePointerFixtures";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "workflow-timing-"));
  roots.push(root);
  vi.stubEnv("MANGA_TRANSLATOR_LOG_PATH", join(root, "test.log"));
  const page = makePage();
  const chapter = makeChapter(page);
  const request = {
    plan: createPageWorkflowPlan(["ocr", "translate"]),
    selection: [{ chapterId: chapter.id, pageIds: [page.id] }],
  };
  return { root, page, chapter, request };
}

describe("persistent workflow timing", () => {
  it("persists active stage, page and cleanup before they settle", async () => {
    const f = await fixture();
    const recorder = new PageWorkflowTimingRecorder(
      f.root,
      randomUUID(),
      f.request,
      [f.chapter],
    );
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const stage = recorder.stage("ocr", async () => {
      const finishPage = recorder.startPage("ocr", f.chapter.id, f.page);
      await recorder.checkpoint();
      entered();
      await pending;
      await finishPage();
    });
    await ready;
    const [active] = await readPageWorkflowTimings(f.root);
    expect(active.activeStage?.stage).toBe("ocr");
    expect(active.activePage).toMatchObject({
      chapterId: f.chapter.id,
      pageId: f.page.id,
      stage: "ocr",
    });
    markWorkflowTimingActive(
      workflowTimingPath(f.root, recorder.record.attemptId),
      false,
    );
    expect((await readPageWorkflowTimings(f.root))[0]).toMatchObject({
      status: "interrupted",
      activePage: active.activePage,
    });
    release();
    await stage;
    await recorder.cleanup(async () => {
      expect(
        (await readPageWorkflowTimings(f.root))[0].activeCleanup?.startedAt,
      ).toBeTruthy();
    });
    await recorder.finish("cancelled");
    const [finished] = await readPageWorkflowTimings(f.root);
    expect(finished.activePage).toBeUndefined();
    expect(finished.activeStage).toBeUndefined();
    expect(finished.activeCleanup).toBeUndefined();
  });
  it("measures actual wall, stage, page and cleanup spans separately, including zero duration", async () => {
    const f = await fixture();
    let now = 0;
    const recorder = new PageWorkflowTimingRecorder(
      f.root,
      randomUUID(),
      f.request,
      [f.chapter],
      () => now,
    );
    await recorder.checkpoint();
    expect((await readPageWorkflowTimings(f.root))[0].status).toBe("running");
    await recorder.stage("ocr", async () => {
      now = 10; // preparation
      const finish = recorder.startPage("ocr", f.chapter.id, f.page);
      now = 40;
      await finish();
      now = 45; // save/model cleanup
    });
    await recorder.stage("translate", async () => {
      await recorder.startPage("translate", f.chapter.id, f.page)();
    });
    recorder.skipPage("review", f.chapter.id, f.page.id);
    recorder.skipPage("review", f.chapter.id, f.page.id);
    await recorder.cleanup(async () => {
      now = 65;
    });
    await recorder.finish("completed");
    now = 1000;
    await recorder.finish("failed");
    const [saved] = await readPageWorkflowTimings(f.root, f.chapter.id);
    expect(saved).toMatchObject({
      status: "completed",
      elapsedMs: 65,
      cleanupMs: 20,
      stages: { ocr: 45, translate: 0 },
    });
    expect(saved.pages[0]).toMatchObject({
      stages: { ocr: 30, translate: 0 },
      skippedStages: ["review"],
    });
    expect(saved.pages[0].stages.detect).toBeUndefined();
    expect(await readPageWorkflowTimings(f.root, "other-chapter")).toEqual([]);
  });

  it("keeps failed spans and distinct attempts for the same resumed run", async () => {
    const f = await fixture();
    let now = 0;
    const runId = randomUUID();
    const first = new PageWorkflowTimingRecorder(
      f.root,
      runId,
      f.request,
      [f.chapter],
      () => now,
    );
    await expect(
      first.stage("ocr", async () => {
        const finish = first.startPage("ocr", f.chapter.id, f.page);
        try {
          now = 15;
          throw new Error("model failed");
        } finally {
          await finish();
        }
      }),
    ).rejects.toThrow("model failed");
    await first.finish("failed");
    const resumed = new PageWorkflowTimingRecorder(
      f.root,
      runId,
      f.request,
      [f.chapter],
      () => now,
    );
    await resumed.finish("cancelled");
    const records = await readPageWorkflowTimings(f.root);
    expect(records).toHaveLength(2);
    expect(new Set(records.map((r) => r.attemptId)).size).toBe(2);
    expect(
      records.find((r) => r.status === "failed")?.pages[0].stages.ocr,
    ).toBe(15);
  });

  it("reports interrupted orphan checkpoints and ignores corrupt files without mutating resume data", async () => {
    const f = await fixture();
    const recorder = new PageWorkflowTimingRecorder(
      f.root,
      randomUUID(),
      f.request,
      [f.chapter],
    );
    await recorder.checkpoint();
    markWorkflowTimingActive(
      workflowTimingPath(f.root, recorder.record.attemptId),
      false,
    );
    await writeFile(workflowTimingPath(f.root, randomUUID()), "invalid json");
    expect((await readPageWorkflowTimings(f.root))[0].status).toBe(
      "interrupted",
    );
    expect(
      JSON.parse(
        await readFile(
          workflowTimingPath(f.root, recorder.record.attemptId),
          "utf8",
        ),
      ).status,
    ).toBe("running");
    const empty = join(f.root, "missing");
    expect(await readPageWorkflowTimings(empty)).toEqual([]);
  });

  it("keeps workflow results and failures authoritative when timing storage is unavailable", async () => {
    const f = await fixture();
    await writeFile(join(f.root, "page-workflow-timings"), "blocked by a file");
    const recorder = new PageWorkflowTimingRecorder(
      f.root,
      randomUUID(),
      f.request,
      [f.chapter],
    );
    await expect(recorder.stage("ocr", async () => "saved page")).resolves.toBe(
      "saved page",
    );
    const failure = new Error("model failed");
    await expect(
      recorder.stage("translate", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    await expect(recorder.finish("failed")).resolves.toBeUndefined();
    expect(recorder.record.status).toBe("failed");
    expect(await readFile(join(f.root, "page-workflow-timings"), "utf8")).toBe(
      "blocked by a file",
    );
  });

  it("retains fifty terminal attempts and all active jobs", async () => {
    const f = await fixture();
    const active = new PageWorkflowTimingRecorder(
      f.root,
      randomUUID(),
      f.request,
      [f.chapter],
    );
    await active.checkpoint();
    await mkdir(join(f.root, "page-workflow-timings"), { recursive: true });
    for (let i = 0; i < 52; i++) {
      const id = randomUUID();
      await writeFile(
        workflowTimingPath(f.root, id),
        JSON.stringify({
          ...active.record,
          attemptId: id,
          status: "completed",
          startedAt: new Date(i).toISOString(),
        }),
      );
    }
    const last = new PageWorkflowTimingRecorder(
      f.root,
      randomUUID(),
      f.request,
      [f.chapter],
    );
    await last.finish("partial");
    const records = await readPageWorkflowTimings(f.root);
    expect(records.filter((r) => r.status !== "running")).toHaveLength(50);
    expect(
      records.find((r) => r.attemptId === active.record.attemptId)?.status,
    ).toBe("running");
    await active.finish("cancelled");
  });
});
