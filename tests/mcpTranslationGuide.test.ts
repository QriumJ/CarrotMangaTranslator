import { expect, it, vi } from "vitest";
import { editingChapter } from "./mcpEditing.fixture";
import { createMcpToolSet } from "../src/main/mcp/mcpToolSet";
import { mcpToolResult } from "../src/main/mcp/mcpToolResult";
import { McpTranslationGuideOutputSchema } from "../src/shared/mcpTranslationGuide";
import {
  McpImageRouteInputSchema,
  selectMcpImageRoute,
} from "../src/shared/mcpTranslationQuality";

function fixture() {
  const chapter = editingChapter();
  const openChapter = vi.fn(async () => structuredClone(chapter));
  const tools = createMcpToolSet({
    openChapter,
    listLibrary: async () => ({ works: [], workOrder: [] }),
  });
  const guide = tools.find(
    (tool) => tool.name === "carrot_get_translation_guide",
  );
  if (!guide) throw new Error("Guide not registered");
  return { chapter, guide, openChapter };
}
it("registers a read-only complete translation guide and exposes no source paths or pixels", async () => {
  const f = fixture(),
    before = structuredClone(f.chapter);
  const content = await f.guide.invoke({ chapterId: "chapter" });
  const result = McpTranslationGuideOutputSchema.parse(
    mcpToolResult(f.guide, content).structuredContent,
  );
  expect(result).toMatchObject({
    qualityPolicy: "complete-translation-v1",
    maxReviewPasses: 3,
    modelStarted: false,
    qualityVerified: false,
    imageRoute: { route: "local" },
  });
  expect(result.pages[0]).toMatchObject({
    blocks: 2,
    requiresVisualSourceInspection: true,
    savedQuality: { soundEffects: 2 },
  });
  expect(result.steps.map((step) => step.id)).toEqual([
    "context",
    "source",
    "plan",
    "text-and-sfx",
    "images",
    "typography",
    "review",
  ]);
  expect(result.availableTools).toEqual([]);
  expect(result.missingTools).toContain("carrot_generate_sound_effects");
  expect(f.guide.readOnly).toBe(true);
  expect(JSON.stringify(content)).not.toMatch(/PRIVATE|\/private\//);
  expect(f.chapter).toEqual(before);
});
it("rejects absent/duplicate pages and excessive scope without silently truncating", async () => {
  const f = fixture();
  await expect(
    f.guide.invoke({ chapterId: "chapter", pageIds: ["missing"] }),
  ).rejects.toThrow();
  await expect(
    f.guide.invoke({ chapterId: "chapter", pageIds: ["page", "page"] }),
  ).rejects.toThrow();
  f.chapter.pages = Array.from({ length: 51 }, (_, index) => ({
    ...f.chapter.pages[0],
    id: String(index),
  }));
  await expect(f.guide.invoke({ chapterId: "chapter" })).rejects.toThrow(/50/);
  const result = await f.guide.invoke({ chapterId: "chapter", pageIds: ["1"] });
  expect(
    JSON.parse(result[0].type === "text" ? result[0].text : "{}").pages,
  ).toHaveLength(1);
});
it("rechecks authorization after reads and filters tools to this connection", async () => {
  const f = fixture();
  let revoked = false;
  f.openChapter.mockImplementation(async () => {
    revoked = true;
    return f.chapter;
  });
  await expect(
    f.guide.invoke(
      { chapterId: "chapter" },
      {
        assertAuthorized: () => {
          if (revoked) throw new Error("revoked");
        },
        visibleToolNames: [],
      },
    ),
  ).rejects.toThrow("revoked");
});
it.each([
  [{}, "check-host"],
  [{ hostGeneration: "available", hostFileTransfer: "available" }, "host"],
  [
    { hostGeneration: "available", hostFileTransfer: "unavailable" },
    "check-app",
  ],
  [
    {
      hostGeneration: "unavailable",
      hostFileTransfer: "unavailable",
      appGeneration: "available",
    },
    "app",
  ],
  [
    {
      hostGeneration: "unavailable",
      hostFileTransfer: "unavailable",
      appGeneration: "unavailable",
    },
    "local",
  ],
  [{ attemptsUsed: 3 }, "local"],
  [{ hostFailure: "delivery-failed", appGeneration: "available" }, "app"],
  [
    { hostFailure: "quality-rejected", appFailure: "generation-failed" },
    "local",
  ],
  [{ hostGeneration: "unavailable", hostFileTransfer: "unknown" }, "check-app"],
  [{ policyRefused: true, appGeneration: "available" }, "blocked"],
])(
  "selects an explicit image route without assuming host generation or transfer: %j",
  (input, route) => {
    expect(
      selectMcpImageRoute(McpImageRouteInputSchema.parse(input)).route,
    ).toBe(route);
  },
);

it("does not recommend a host file route when this connection lacks upload/apply tools", async () => {
  const f = fixture();
  const content = await f.guide.invoke(
    {
      chapterId: "chapter",
      imageCapabilities: {
        hostGeneration: "available",
        hostFileTransfer: "available",
        appGeneration: "available",
      },
    },
    {
      visibleToolNames: ["carrot_get_page_preview"],
      assertAuthorized: () => {},
    },
  );
  const result = McpTranslationGuideOutputSchema.parse(
    mcpToolResult(f.guide, content).structuredContent,
  );
  expect(result.availableTools).toEqual(["carrot_get_page_preview"]);
  expect(result.imageRoute.route).toBe("local");
});
