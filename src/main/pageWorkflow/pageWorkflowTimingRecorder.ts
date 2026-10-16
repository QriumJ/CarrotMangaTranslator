import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import type { ChapterSnapshot, MangaPage } from "../../shared/libraryTypes";
import type { PageWorkflowRequest } from "../../shared/pageWorkflowTypes";
import type { PageWorkflowStage } from "../../shared/pageWorkflowStages";
import type { PageWorkflowTiming } from "../../shared/pageWorkflowTiming";
import { writeJsonFile } from "../libraryStore/storage";
import { logWarn } from "../logger";
import {
  markWorkflowTimingActive,
  readPageWorkflowTimings,
  workflowTimingPath,
} from "./pageWorkflowTimingStore";

export class PageWorkflowTimingRecorder {
  readonly record: PageWorkflowTiming;
  private readonly started: number;
  private writes = Promise.resolve();
  private readonly path: string;
  private finished = false;

  constructor(
    private readonly dataRoot: string,
    runId: string,
    request: PageWorkflowRequest,
    chapters: ChapterSnapshot[],
    private readonly now: () => number = () => performance.now(),
  ) {
    this.started = now();
    this.record = {
      version: 1,
      attemptId: randomUUID(),
      runId,
      startedAt: new Date().toISOString(),
      status: "running",
      elapsedMs: 0,
      stages: {},
      cleanupMs: 0,
      chapters: chapters.map(({ id, title, workId }) => ({
        id,
        title,
        workId,
      })),
      pages: request.selection.flatMap((selection) => {
        const chapter = chapters.find(
          (item) => item.id === selection.chapterId,
        );
        return selection.pageIds.map((pageId) => ({
          chapterId: selection.chapterId,
          pageId,
          pageName:
            chapter?.pages.find((page) => page.id === pageId)?.name ?? pageId,
          stages: {},
          skippedStages: [],
        }));
      }),
    };
    this.path = workflowTimingPath(dataRoot, this.record.attemptId);
    markWorkflowTimingActive(this.path, true);
  }

  checkpoint(): Promise<void> {
    this.record.elapsedMs = this.elapsed(this.started);
    const snapshot = structuredClone(this.record);
    this.writes = this.writes
      .then(() => writeJsonFile(this.path, snapshot))
      .catch((error: unknown) => {
        logWarn("Could not persist workflow timing checkpoint", {
          attemptId: this.record.attemptId,
          error,
        });
      });
    return this.writes;
  }

  async stage<T>(
    stage: PageWorkflowStage,
    execute: () => Promise<T>,
  ): Promise<T> {
    const start = this.now();
    this.record.activeStage = { stage, startedAt: new Date().toISOString() };
    await this.checkpoint();
    try {
      return await execute();
    } finally {
      this.record.stages[stage] =
        (this.record.stages[stage] ?? 0) + this.elapsed(start);
      delete this.record.activeStage;
      await this.checkpoint();
    }
  }

  startPage(
    stage: PageWorkflowStage,
    chapterId: string,
    page: MangaPage,
  ): () => Promise<void> {
    const start = this.now();
    this.record.activePage = {
      stage,
      chapterId,
      pageId: page.id,
      startedAt: new Date().toISOString(),
    };
    void this.checkpoint();
    return async () => {
      const row = this.record.pages.find(
        (item) => item.chapterId === chapterId && item.pageId === page.id,
      );
      if (row)
        row.stages[stage] = (row.stages[stage] ?? 0) + this.elapsed(start);
      delete this.record.activePage;
      await this.checkpoint();
    };
  }

  skipPage(stage: PageWorkflowStage, chapterId: string, pageId: string): void {
    const row = this.record.pages.find(
      (item) => item.chapterId === chapterId && item.pageId === pageId,
    );
    if (row && !row.skippedStages.includes(stage))
      row.skippedStages.push(stage);
  }

  async cleanup(execute: () => Promise<void>): Promise<void> {
    const start = this.now();
    this.record.activeCleanup = { startedAt: new Date().toISOString() };
    await this.checkpoint();
    try {
      await execute();
    } finally {
      this.record.cleanupMs += this.elapsed(start);
      delete this.record.activeCleanup;
      await this.checkpoint();
    }
  }

  async finish(
    status: Exclude<PageWorkflowTiming["status"], "running" | "interrupted">,
  ): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.record.status = status;
    this.record.finishedAt = new Date().toISOString();
    await this.checkpoint();
    markWorkflowTimingActive(this.path, false);
    try {
      const terminal = (await readPageWorkflowTimings(this.dataRoot)).filter(
        (record) => record.status !== "running",
      );
      for (const record of terminal.slice(50))
        await unlink(workflowTimingPath(this.dataRoot, record.attemptId));
    } catch (error) {
      logWarn("Could not prune workflow timing history", error);
    }
  }

  private elapsed(start: number): number {
    return Math.max(0, Math.round(this.now() - start));
  }
}
