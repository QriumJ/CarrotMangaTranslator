import { expect, it } from "vitest";
import { compositeNativeReviewFixture } from "./mcpCompositeNativeReview.fixture";
import { createTranslationGuideTool } from "../src/main/mcp/mcpTranslationGuideTool";
import { McpTranslationGuideOutputSchema } from "../src/shared/mcpTranslationGuide";
import { mcpToolResult } from "../src/main/mcp/mcpToolResult";

it("issues server saved-quality metadata with actual native source evidence and saved context", async () => {
  const f = await compositeNativeReviewFixture();
  try {
    f.plan.qualityPolicy = "complete-translation-v1";
    f.record.snapshot = (await f.read()).snapshot;
    const evidence = await f.issue();
    expect(evidence).toHaveLength(f.targets.length);
    for (const item of evidence) {
      expect(item.savedQuality?.blocks).toBeGreaterThan(0);
      await expect(
        f.review.verifyEvidence(f.record, [item], f.guard),
      ).rejects.toThrow(/Retrieve/);
      await f.review.readEvidence(f.record, item.id, f.guard);
    }
    await expect(
      f.review.verifyEvidence(f.record, evidence, f.guard),
    ).resolves.toBeUndefined();
    const tool = createTranslationGuideTool(
      {
        openChapter: f.library.openChapter,
        readContext: f.library.readWorkContextForEdit,
        listLibrary: f.library.listLibrary,
      },
      ["carrot_get_work_context", "carrot_generate_sound_effects"],
    );
    const result = McpTranslationGuideOutputSchema.parse(
      mcpToolResult(
        tool,
        await tool.invoke({
          chapterId: "chapter",
          imageCapabilities: { appGeneration: "available" },
        }),
      ).structuredContent,
    );
    expect(result.context.state).toBe("available");
    expect(result.context.revision).toMatch(/^[a-f0-9]{16}$/);
    expect(result.imageRoute.route).toBe("app");
    expect(result.pages.map((page) => page.savedQuality)).toEqual(
      evidence.map((item) => item.savedQuality),
    );
    f.review.close();
    await expect(
      f.review.readEvidence(f.record, evidence[0].id, f.guard),
    ).rejects.toThrow();
  } finally {
    await f.close();
  }
});
