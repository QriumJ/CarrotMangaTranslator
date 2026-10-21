import { describe, expect, it, vi } from "vitest";
import {
  makePage,
  makeChapter,
  makeRuntime,
  makeContext,
} from "./inpaintingBubbleLayoutJob.fixture";
import { startInpaintingJob } from "../src/main/jobs/inpaintingJobs";
import {
  runBubbleLayoutPostprocess,
  type BubbleLayoutRunner,
} from "../src/main/inpainting/bubbleLayoutRunner";
import {
  applyInpaintingLayoutStates,
  captureInpaintingLayoutStates,
  pageMatchesInpaintingLayoutStates,
} from "../src/main/inpainting/inpaintingLayoutState";
import { StartInpaintingRequestSchema } from "../src/shared/ipcJobSchemas";
import type { InpaintingRevisionChange } from "../src/main/inpainting/inpaintingRevisionStore";

function pageWithThreeBlocks() {
  const page = makePage();
  page.blocks = [0, 1, 2].map((index) => ({
    ...page.blocks[0],
    id: `block-${index + 1}`,
    bubbleLayoutPaddingRatio: (index + 1) / 10,
  }));
  return page;
}
const layout = {
  version: 1 as const,
  direction: "horizontal" as const,
  confidence: 1,
  insetRatio: 0,
  regions: [
    { spans: [{ blockStart: 0, blockEnd: 1, inlineStart: 0, inlineEnd: 1 }] },
  ],
};

describe("explicit balloon padding edits", () => {
  it("applies zero to selected blocks only, preserves content, and undoes the preference with geometry", async () => {
    const page = pageWithThreeBlocks();
    const original = structuredClone(page);
    const chapter = makeChapter(page);
    const changes: InpaintingRevisionChange[] = [];
    const runner: BubbleLayoutRunner = {
      runPage: vi.fn(
        async (request: Parameters<BubbleLayoutRunner["runPage"]>[0]) => {
          expect(request.targetBlockIds).toEqual(["block-1", "block-2"]);
          expect(
            request.page.blocks.map((b) => b.bubbleLayoutPaddingRatio),
          ).toEqual([0, 0, 0.3]);
          return {
            patches: request.page.blocks.map((block) => ({
              blockId: block.id,
              renderBbox: { x: 100, y: 100, w: 500, h: 400 },
              renderBboxSpace: "normalized_1000" as const,
              bubbleLayout: layout,
              bubbleLayoutPaddingRatio: block.bubbleLayoutPaddingRatio,
            })),
          };
        },
      ),
    };
    const runtime = makeRuntime(new Map([[chapter.id, chapter]]), () => runner);
    const result = await startInpaintingJob(
      makeContext(changes),
      {
        chapterId: chapter.id,
        pageId: page.id,
        mode: "page-bubble-layout",
        policy: "balanced",
        blockIds: ["block-1", "block-2"],
        paddingRatio: 0,
      },
      runtime,
    );
    expect(result.status).toBe("completed");
    const saved = result.chapter?.pages[0];
    if (!saved) throw new Error("Expected a saved chapter");
    expect(saved.blocks.map((b) => b.bubbleLayoutPaddingRatio)).toEqual([
      0, 0, 0.3,
    ]);
    expect(saved.blocks[2]).toEqual(original.blocks[2]);
    expect(
      saved.blocks.map((b) => [
        b.sourceText,
        b.translatedText,
        b.bbox,
        b.textColor,
      ]),
    ).toEqual(
      original.blocks.map((b) => [
        b.sourceText,
        b.translatedText,
        b.bbox,
        b.textColor,
      ]),
    );
    expect(runtime.acquireEngine).not.toHaveBeenCalled();
    expect(changes).toHaveLength(1);
    const before = changes[0].beforeLayout;
    const after = changes[0].afterLayout;
    if (!before || !after)
      throw new Error("Expected reversible layout history");
    expect(pageMatchesInpaintingLayoutStates(saved, after)).toBe(true);
    const restored = applyInpaintingLayoutStates(saved, before);
    expect(restored.blocks).toEqual(original.blocks);
    expect(applyInpaintingLayoutStates(restored, after).blocks).toEqual(
      saved.blocks,
    );
    expect(page).toEqual(original);
  });

  it.each([{ blockIds: ["missing"] }, { blockIds: ["block-1", "block-1"] }])(
    "rejects stale or duplicate selection %j before detector execution",
    async ({ blockIds }) => {
      const page = pageWithThreeBlocks(),
        chapter = makeChapter(page);
      const runPage = vi.fn(async () => ({ patches: [] }));
      const runtime = makeRuntime(new Map([[chapter.id, chapter]]), () => ({
        runPage,
      }));
      const result = await startInpaintingJob(
        makeContext([]),
        {
          chapterId: chapter.id,
          pageId: page.id,
          mode: "page-bubble-layout",
          policy: "balanced",
          blockIds,
          paddingRatio: 0,
        },
        runtime,
      );
      expect(result.status).toBe("failed");
      expect(runPage).not.toHaveBeenCalled();
    },
  );

  it("does not store a padding draft when detection fails or has no match", async () => {
    const page = pageWithThreeBlocks();
    const config = {
      policy: "balanced" as const,
      overwriteManual: true,
      paddingRatioOverride: 0,
    };
    const processed = await runBubbleLayoutPostprocess({
      page,
      blockIds: ["block-1"],
      config,
      runner: { runPage: async () => ({ patches: [] }) },
      signal: new AbortController().signal,
    });
    expect(processed.page).toEqual(page);
    await expect(
      runBubbleLayoutPostprocess({
        page,
        blockIds: ["block-1"],
        config,
        runner: {
          runPage: async () => {
            throw new Error("detector unavailable");
          },
        },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow("detector unavailable");
    expect(page.blocks[0].bubbleLayoutPaddingRatio).toBe(0.1);
  });

  it.each([false, true])(
    "keeps page-wide padding overrides separate from erasure (%s)",
    async (sourceEraseMask) => {
      const page = pageWithThreeBlocks();
      const result = await runBubbleLayoutPostprocess({
        page,
        sourceEraseMask,
        config: {
          policy: "balanced",
          overwriteManual: true,
          paddingRatioOverride: 0,
        },
        runner: {
          runPage: async (request) => {
            expect(request.targetBlockIds).toBeUndefined();
            expect(
              request.page.blocks.map(
                (block) => block.bubbleLayoutPaddingRatio,
              ),
            ).toEqual(sourceEraseMask ? [0.1, 0.2, 0.3] : [0, 0, 0]);
            return { patches: [] };
          },
        },
        signal: new AbortController().signal,
      });
      expect(result.page).toEqual(page);
    },
  );

  it("rejects invalid padding at IPC and keeps legacy history applicable", () => {
    const page = pageWithThreeBlocks(),
      chapter = makeChapter(page);
    const request = {
      mode: "page-bubble-layout",
      chapterId: chapter.id,
      pageId: page.id,
      policy: "balanced",
    };
    for (const paddingRatio of [-0.1, 0.71, NaN, Infinity])
      expect(
        StartInpaintingRequestSchema.safeParse({ ...request, paddingRatio })
          .success,
      ).toBe(false);
    expect(
      StartInpaintingRequestSchema.safeParse({ ...request, paddingRatio: 0 })
        .success,
    ).toBe(true);
    expect(
      StartInpaintingRequestSchema.safeParse({
        ...request,
        paddingRatio: 0,
        blockIds: ["block-1", "block-2"],
      }).success,
    ).toBe(true);
    for (const selection of [
      { blockIds: [] },
      { blockIds: ["block-1", "block-1"] },
      { blockId: "block-1", blockIds: ["block-2"] },
    ]) {
      expect(
        StartInpaintingRequestSchema.safeParse({ ...request, ...selection })
          .success,
      ).toBe(false);
    }
    const state = {
      blockId: page.blocks[0].id,
      renderBbox: null,
      renderBboxSpace: null,
      bubbleLayout: null,
    };
    expect(pageMatchesInpaintingLayoutStates(page, [state])).toBe(true);
    expect(
      applyInpaintingLayoutStates(page, [state]).blocks[0]
        .bubbleLayoutPaddingRatio,
    ).toBe(0.1);
  });

  it("undo removes a newly introduced preference and refuses corrupt history", () => {
    const page = makePage();
    const before = captureInpaintingLayoutStates(page, [page.blocks[0].id]);
    const edited = structuredClone(page);
    edited.blocks[0].bubbleLayoutPaddingRatio = 0;
    expect(pageMatchesInpaintingLayoutStates(edited, before)).toBe(false);
    const restored = applyInpaintingLayoutStates(edited, before);
    expect(Object.hasOwn(restored.blocks[0], "bubbleLayoutPaddingRatio")).toBe(
      false,
    );
    for (const ratio of [-1, 0.8, Infinity, NaN]) {
      expect(() =>
        applyInpaintingLayoutStates(edited, [
          { ...before[0], bubbleLayoutPaddingRatio: ratio },
        ]),
      ).toThrow(/여백/);
    }
  });

  it("rejects an invalid detector preference without committing any geometry", async () => {
    const page = pageWithThreeBlocks();
    for (const ratio of [-1, 0.8, Infinity, NaN]) {
      await expect(
        runBubbleLayoutPostprocess({
          page,
          config: { policy: "balanced", overwriteManual: true },
          runner: {
            runPage: async () => ({
              patches: [
                {
                  blockId: page.blocks[0].id,
                  bubbleLayout: layout,
                  bubbleLayoutPaddingRatio: ratio,
                },
              ],
            }),
          },
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow(/여백/);
    }
    expect(page.blocks[0].bubbleLayout).toBeUndefined();
    expect(page.blocks[0].bubbleLayoutPaddingRatio).toBe(0.1);
  });
});
