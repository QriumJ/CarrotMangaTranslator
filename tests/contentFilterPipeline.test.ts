import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobEvent } from "../src/shared/jobTypes";
import {
  basePipelineOptions,
  cleanupPipelineTempDirs,
  loadPipeline,
  makePage,
} from "./helpers/wholePagePipelineHarness";
import { successTranslationResult } from "./helpers/wholePageTranslationResults";
import { makeBlock } from "./helpers/workspacePointerFixtures";

const { readChatCompletionResult } =
  require("../src/main/runtime/transport/chat-completion.cjs") as {
    readChatCompletionResult: (
      response: Response,
      options: Record<string, unknown>,
      summary: Record<string, unknown>,
      startedAt: number,
    ) => Promise<unknown>;
  };

afterEach(async () => {
  vi.unstubAllEnvs();
  await cleanupPipelineTempDirs();
});

describe("content filter pipeline", () => {
  it("stops a content-policy block after one request without replacing page data", async () => {
    vi.stubEnv("MANGA_TRANSLATOR_PAGE_RETRIES", "5");
    const page = makePage("page-a", "001.png", { blocks: [makeBlock()] });
    const original = structuredClone(page);
    const requestTranslation = vi.fn(async () => {
      await readChatCompletionResult(
        new Response(
          JSON.stringify({
            choices: [
              { finish_reason: "content_filter: PROHIBITED_CONTENT", index: 0 },
            ],
          }),
          { status: 200 },
        ),
        {},
        {},
        Date.now(),
      );
      return successTranslationResult();
    });
    const events: JobEvent[] = [];
    const onPagesComplete = vi.fn();
    const onPageFailed = vi.fn();
    const { runWholePagePipeline, runtime } = await loadPipeline({
      requestTranslation,
    });

    await expect(
      runWholePagePipeline({
        ...basePipelineOptions([page, makePage("page-b", "002.png")], events),
        onPagesComplete,
        onPageFailed,
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("사유: PROHIBITED_CONTENT"),
      failureCategory: "model-refusal",
      nonRetriable: true,
    });

    expect(requestTranslation).toHaveBeenCalledOnce();
    expect(runtime.saveArtifacts).not.toHaveBeenCalled();
    expect(onPagesComplete).not.toHaveBeenCalled();
    expect(onPageFailed).not.toHaveBeenCalled();
    expect(page).toEqual(original);
    expect(events.map((event) => event.phase)).not.toContain("page_retry");
    expect(events.map((event) => event.phase)).not.toContain("page_skipped");
    expect(runtime.disposeEndpoint).toHaveBeenCalledOnce();
  });
});
