import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { expect, it, vi } from "vitest";
import { PNG } from "pngjs";
import { selectionAppFixture } from "./mcpSelectionApp.fixture";
import type {
  McpWorkflowStep,
  McpWorkflowPage,
} from "../src/main/application/mcpWorkflowPolicy";

it.each([false, true])(
  "batches fixed workflow pages under native ownership and rejects later source edits (%s)",
  async (change) => {
    const f = await selectionAppFixture();
    try {
      const chapter = JSON.parse(await readFile(f.chapterPath, "utf8"));
      for (const page of chapter.pages) {
        page.blocks = [];
        page.blockOrder = [];
      }
      await writeFile(f.chapterPath, JSON.stringify(chapter));
      const { readWorkflowPage } =
        await import("../src/main/mcp/mcpWorkflowEvidence");
      const { withMcpWorkflowOcrBatch, collectMcpWorkflowOcrBatch } =
        await import("../src/main/mcp/mcpWorkflowOcrBatch");
      const { runMcpAppJob } = await import("../src/main/mcp/mcpAppJob");
      const saved = await f.library.openChapter("chapter");
      const controller = new AbortController();
      const guard = () => controller.signal.throwIfAborted();
      const pages: McpWorkflowPage[] = [];
      for (const page of saved.pages)
        pages.push(
          (
            await readWorkflowPage(
              { chapterId: saved.id, pageId: page.id },
              guard,
            )
          ).evidence,
        );
      const steps: McpWorkflowStep[] = pages.map((page, index) => ({
        index,
        stage: "ocr",
        stageIndex: 0,
        pageIndex: index,
        chapterId: page.chapterId,
        pageId: page.pageId,
        status: "pending",
        attempts: 0,
        attemptId: null,
        jobId: null,
        outputId: null,
        changeId: null,
        errorCode: null,
        outcome: null,
      }));
      const collect = vi.fn(async (inputs: typeof saved.pages) => {
        expect(inputs.map((page) => page.id)).toEqual(
          saved.pages.map((page) => page.id),
        );
        expect(f.app.jobs.pageHandoffs.activities).toHaveLength(2);
        return new Map(
          inputs.map((page) => [
            page.id,
            { hints: [{ id: 1, ocrText: page.id }], diagnostics: [] },
          ]),
        );
      });
      const run = f.app.jobs.runModelGroup(controller, () =>
        withMcpWorkflowOcrBatch({ pages, steps }, guard, async () => {
          for (const [index, page] of saved.pages.entries()) {
            if (change && index === 1) {
              const png = PNG.sync.read(f.bytes);
              png.data[0] = 25;
              await writeFile(page.imagePath, PNG.sync.write(png));
            }
            const operation = {
              id: randomUUID(),
              signal: controller.signal,
              progress: vi.fn(),
              assertAuthorized: guard,
            };
            const result = await runMcpAppJob(
              f.app,
              operation,
              "gemma-analysis",
              (context) =>
                collectMcpWorkflowOcrBatch(
                  f.app,
                  saved.id,
                  page,
                  context,
                  collect,
                ),
              {
                resources: [
                  { kind: "model-runtime", scope: "*", access: "write" },
                ],
                page: {
                  chapterId: saved.id,
                  pageId: page.id,
                  readChapter: f.library.openChapter,
                },
              },
            );
            expect(result?.hints[0]).toMatchObject({ ocrText: page.id });
            expect(f.app.jobs.pageHandoffs.activities).toEqual([]);
          }
        }),
      );
      if (change)
        await expect(run).rejects.toMatchObject({ code: "revision_conflict" });
      else await run;
      expect(collect).toHaveBeenCalledOnce();
      expect(f.app.jobs.all).toEqual([]);
      expect(f.app.jobs.pageHandoffs.activities).toEqual([]);
    } finally {
      await f.close();
    }
  },
);
