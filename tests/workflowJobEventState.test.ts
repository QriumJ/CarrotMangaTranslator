import { describe, expect, it } from "vitest";
import { appI18n, initializeAppI18n } from "../src/renderer/src/appI18n";
import { reduceJobEventBatch } from "../src/renderer/src/hooks/jobEventState";
import { formatWorkflowProgress } from "../src/renderer/src/lib/workflowJobProgress";
import { JobEventSchema } from "../src/shared/ipcJobSchemas";
import type { JobEvent, JobState } from "../src/shared/jobTypes";

describe("page-stage progress through the real event reducer", () => {
  it("retains scope across updates, then clears it for the next ordinary job", async () => {
    await initializeAppI18n("ko");
    const t = appI18n.getFixedT("ko", "renderer");
    const idle: JobState = {
      id: "idle",
      kind: "gemma-analysis",
      status: "idle",
      progressText: "",
    };
    const event: JobEvent = {
      id: "workflow",
      kind: "gemma-analysis",
      status: "starting",
      progressText: "페이지 작업 준비",
      progressCurrent: 0,
      progressTotal: 560,
      workflowProgress: { pageCount: 80, stageCount: 7 },
    };
    const parsed = JobEventSchema.parse(event);
    const starting = reduceJobEventBatch(idle, [parsed], t);
    const running = reduceJobEventBatch(
      starting,
      [
        {
          id: "workflow",
          kind: "gemma-analysis",
          status: "running",
          progressText: "번역 중",
          progressCurrent: 123,
          progressTotal: 560,
        },
      ],
      t,
    );
    expect(running.workflowProgress).toEqual({ pageCount: 80, stageCount: 7 });
    expect(
      formatWorkflowProgress(running, { current: 123, total: 560 }, t),
    ).toEqual({
      scope: "80페이지 · 7단계",
      operations: "단계 작업 123 / 560",
    });
    const completed = reduceJobEventBatch(
      running,
      [{ ...event, status: "completed", progressCurrent: 560 }],
      t,
    );
    const next = reduceJobEventBatch(
      completed,
      [
        {
          id: "ordinary",
          kind: "inpainting",
          status: "starting",
          progressText: "지우기 준비",
        },
      ],
      t,
    );
    expect(next.workflowProgress).toBeUndefined();
    expect(formatWorkflowProgress(next, null, t)).toBeNull();
  });
});
