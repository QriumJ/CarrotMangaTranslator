import { AsyncLocalStorage } from "node:async_hooks";
import type { MangaPage } from "../../shared/libraryTypes";
import type { OcrBboxResult } from "../pipeline/types";
import type { McpWorkflowRecord } from "../application/mcpWorkflowPolicy";
import type { McpOperationContext } from "../application/mcpOperationService";
import type { InpaintingJobContext } from "../jobs/inpaintingJobTypes";
import { McpEditError } from "../application/mcpEditPolicy";
import { openChapter } from "../library";
import {
  acquireJobPage,
  assertJobPagesAvailable,
  reserveJobChapter,
} from "../jobs/jobPageOwnership";
import {
  assertWorkflowIdentity,
  readWorkflowPage,
} from "./mcpWorkflowEvidence";

type Batch = {
  record: Pick<McpWorkflowRecord, "pages" | "steps">;
  guard: () => void;
  chapters: Map<string, Promise<Map<string, OcrBboxResult>>>;
};
const current = new AsyncLocalStorage<Batch>();

/** Only the admitted native workflow may prepare its other fixed OCR targets. */
export function withMcpWorkflowOcrBatch<T>(
  record: Batch["record"],
  guard: () => void,
  run: () => Promise<T>,
) {
  return current.run({ record, guard, chapters: new Map() }, run);
}

export async function collectMcpWorkflowOcrBatch(
  app: InpaintingJobContext,
  chapterId: string,
  page: MangaPage,
  operation: McpOperationContext,
  collect: (pages: MangaPage[]) => Promise<Map<string, OcrBboxResult>>,
): Promise<OcrBboxResult | undefined> {
  const batch = current.getStore();
  if (!batch) return undefined;
  batch.guard();
  let pending = batch.chapters.get(chapterId);
  if (!pending) {
    pending = prepareChapter(
      batch,
      app,
      chapterId,
      page.id,
      operation,
      collect,
    );
    batch.chapters.set(chapterId, pending);
  }
  const results = await pending;
  // A later native page job owns its own handoff and verifies the original again.
  await readBoundPage(batch, chapterId, page.id, operation);
  const result = results.get(page.id);
  if (!result)
    throw new Error("Prepared workflow OCR is missing its fixed page.");
  return result;
}

async function prepareChapter(
  batch: Batch,
  app: InpaintingJobContext,
  chapterId: string,
  activePageId: string,
  operation: McpOperationContext,
  collect: (pages: MangaPage[]) => Promise<Map<string, OcrBboxResult>>,
) {
  const targets = batch.record.pages.filter(
    (target, index) =>
      target.chapterId === chapterId &&
      batch.record.steps.some(
        (step) =>
          step.stage === "ocr" &&
          step.pageIndex === index &&
          step.status !== "completed",
      ),
  );
  const otherIds = targets
    .map((target) => target.pageId)
    .filter((id) => id !== activePageId);
  operation.assertAuthorized();
  assertJobPagesAvailable(app.jobs, operation.id, chapterId, otherIds);
  reserveJobChapter(
    app.jobs,
    operation.id,
    await openChapter(chapterId),
    otherIds,
  );
  for (const id of otherIds)
    await acquireJobPage(app.jobs, operation.id, chapterId, id, openChapter);
  const pages: MangaPage[] = [];
  for (const target of targets) {
    const page = await readBoundPage(
      batch,
      chapterId,
      target.pageId,
      operation,
    );
    if (!page.blocks.length) pages.push(page);
  }
  const results = await collect(pages);
  for (const page of pages)
    await readBoundPage(batch, chapterId, page.id, operation);
  return results;
}

async function readBoundPage(
  batch: Batch,
  chapterId: string,
  pageId: string,
  operation: McpOperationContext,
) {
  batch.guard();
  operation.assertAuthorized();
  const target = batch.record.pages.find(
    (page) => page.chapterId === chapterId && page.pageId === pageId,
  );
  if (!target)
    throw new McpEditError(
      "access_denied",
      "OCR page is outside the admitted workflow.",
    );
  const { page, evidence } = await readWorkflowPage(
    target,
    operation.assertAuthorized,
  );
  assertWorkflowIdentity(target, evidence);
  if (
    target.revision !== evidence.revision ||
    target.reviewRevision !== evidence.reviewRevision
  )
    throw new McpEditError(
      "revision_conflict",
      "Workflow OCR input changed after preparation.",
    );
  return page;
}
