import { describe, expect, it } from "vitest";
import { isTranslationModelBusy } from "../src/renderer/src/app/session/jobTargetLocks";
import { pageWorkflowStartIssue } from "../src/renderer/src/hooks/useRunPageWorkflow";
import type { AppActivityState } from "../src/shared/appActivityTypes";
import type { LibraryIndex } from "../src/shared/libraryTypes";
import type { PageWorkflowStage } from "../src/shared/pageWorkflowStages";
import {
  createPageWorkflowPlan,
  type PageWorkflowRequest,
} from "../src/shared/pageWorkflowTypes";

const now = "2026-09-29T00:00:00.000Z";
const library: LibraryIndex = {
  workOrder: ["work-1"],
  works: [
    {
      id: "work-1",
      title: "Work",
      chapterOrder: ["chapter-1"],
      createdAt: now,
      updatedAt: now,
      chapters: [
        {
          id: "chapter-1",
          workId: "work-1",
          title: "1",
          status: "idle",
          createdAt: now,
          updatedAt: now,
          pageCount: 1,
        },
      ],
    },
  ],
};

const request = (
  stages: PageWorkflowStage[],
  erasureEngine: "local" | "codex" = "local",
): PageWorkflowRequest => ({
  plan: { ...createPageWorkflowPlan(stages), erasureEngine },
  selection: [{ chapterId: "chapter-1", pageIds: ["p1"] }],
});

const idle: AppActivityState = { version: 1, activities: [], pages: [] };
const codex = { modelProvider: "openai-codex" } as const;
const base = {
  activities: idle,
  jobActive: false,
  library,
  modelResourceBusy: false,
  settings: codex,
};

describe("renderer admission beside running model jobs", () => {
  it("lets remote providers ignore shared jobs but not exclusive ones", () => {
    const shared = { modelResourceBusy: true, exclusiveModelBusy: false };
    expect(isTranslationModelBusy(shared, codex)).toBe(false);
    expect(isTranslationModelBusy(shared, { modelProvider: "gemma" })).toBe(
      true,
    );
    expect(
      isTranslationModelBusy(
        { modelResourceBusy: true, exclusiveModelBusy: true },
        codex,
      ),
    ).toBe(true);
  });

  it("starts a Codex workflow beside another shared job", () => {
    expect(
      pageWorkflowStartIssue(request(["ocr", "translate"]), {
        ...base,
        modelResourceBusy: true,
      }),
    ).toBeNull();
  });

  it("keeps local erasure waiting for every model job", () => {
    expect(
      pageWorkflowStartIssue(request(["translate", "erase"]), {
        ...base,
        modelResourceBusy: true,
      }),
    ).toMatch(/로컬 모델/);
    expect(
      pageWorkflowStartIssue(request(["translate", "erase"], "codex"), {
        ...base,
        modelResourceBusy: true,
      }),
    ).toBeNull();
  });

  it("explains pages and work context held by another run", () => {
    const busyPages: AppActivityState = {
      ...idle,
      pages: [
        {
          jobId: "other",
          chapterId: "chapter-1",
          pageId: "p1",
          phase: "queued",
        },
      ],
    };
    expect(
      pageWorkflowStartIssue(request(["translate"]), {
        ...base,
        activities: busyPages,
      }),
    ).toMatch(/페이지 1개/);
    const busyContext: AppActivityState = {
      ...idle,
      activities: [
        {
          id: "other",
          category: "job",
          kind: "gemma-analysis",
          mutatesLibrary: true,
          blocksQuit: true,
          startedAt: 0,
          resources: [
            { kind: "work-context", scope: "work-1", access: "write" },
          ],
        },
      ],
    };
    expect(
      pageWorkflowStartIssue(request(["translate"]), {
        ...base,
        activities: busyContext,
      }),
    ).toMatch(/번역 문맥/);
  });

  it("waits for a multi-pass flow that owns the cancel flag", () => {
    expect(
      pageWorkflowStartIssue(request(["translate"]), {
        ...base,
        exclusiveFlowActiveRef: { current: true },
      }),
    ).toMatch(/번역 흐름/);
  });
});
