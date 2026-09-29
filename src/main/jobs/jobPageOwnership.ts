import type { ChapterSnapshot, MangaPage } from "../../shared/libraryTypes";
import {
  pageContentResource,
  type AppActivityResource,
} from "../../shared/appActivityTypes";
import { AppActivityBusyError } from "../appActivityGate";
import { withLibraryMutation } from "../library/lock";
import type { ActiveJobStore } from "./activeJob";
import { reserveChapterTargets } from "./jobActivityResources";

export function reserveJobChapter(
  jobs: ActiveJobStore,
  jobId: string,
  chapter: ChapterSnapshot,
  pageIds: readonly string[],
  extraResources: AppActivityResource[] = [],
  queuePages = true,
): void {
  const job = jobs.get(jobId);
  if (!job?.resources) return;
  jobs.updateResources(jobId, [
    ...job.resources,
    ...reserveChapterTargets(chapter, pageIds),
    ...extraResources,
  ]);
  if (queuePages) jobs.pageHandoffs.reserve(jobId, chapter.id, pageIds);
}

/**
 * Concurrent runs must not wait on each other's pages: two runs that each hold
 * part of the other's selection would never finish. A run that targets a page
 * another run has queued or is writing is refused before it takes any page.
 */
export function assertJobPagesAvailable(
  jobs: ActiveJobStore,
  jobId: string,
  chapterId: string,
  pageIds: readonly string[],
): void {
  const owner = jobs.activityOwnerFor(jobId);
  const wanted = new Set(pageIds);
  const reservedElsewhere = jobs.pageHandoffs.activities.some(
    (page) =>
      page.chapterId === chapterId &&
      wanted.has(page.pageId) &&
      page.phase !== "completed" &&
      page.phase !== "failed" &&
      jobs.activityOwnerFor(page.jobId) !== owner,
  );
  const writtenElsewhere = jobs.gate.findConflict(
    pageIds.map((pageId) => pageContentResource(chapterId, pageId)),
    owner,
  );
  if (reservedElsewhere || writtenElsewhere)
    throw new Error(
      "다른 작업이 처리 중인 페이지가 포함되어 있습니다. 그 작업이 끝난 뒤 다시 실행해 주세요.",
    );
}

/** Renderer-started runs reserve only pages no other run is holding. */
export function reserveAvailableJobChapter(
  ...args: Parameters<typeof reserveJobChapter>
): void {
  const [jobs, jobId, chapter, pageIds] = args;
  assertJobPagesAvailable(jobs, jobId, chapter.id, pageIds);
  reserveJobChapter(...args);
}

export async function acquireJobPage(
  jobs: ActiveJobStore,
  jobId: string,
  chapterId: string,
  pageId: string,
  readChapter: (chapterId: string) => Promise<ChapterSnapshot>,
): Promise<MangaPage> {
  return acquirePageWith(jobs, jobId, chapterId, pageId, async (signal) => {
    const chapter = await readChapter(chapterId);
    signal.throwIfAborted();
    const page = chapter.pages.find((candidate) => candidate.id === pageId);
    if (!page) throw new Error("처리할 페이지가 삭제되었습니다.");
    return page;
  });
}

/** Workflow reads its complete target snapshot once after all handoffs. */
export function acquireJobPageOwnership(
  jobs: ActiveJobStore,
  jobId: string,
  chapterId: string,
  pageId: string,
): Promise<void> {
  return acquirePageWith(jobs, jobId, chapterId, pageId, async () => {});
}

async function acquirePageWith<T>(
  jobs: ActiveJobStore,
  jobId: string,
  chapterId: string,
  pageId: string,
  read: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const job = jobs.get(jobId);
  if (!job) throw new Error("작업이 이미 종료되었습니다.");
  const signal = job.abortController.signal;
  await jobs.pageHandoffs.request(jobId, chapterId, pageId, signal);
  const resource = pageContentResource(chapterId, pageId);
  while (true) {
    await jobs.gate.waitForAvailable(
      [resource],
      jobs.activityOwnerFor(jobId),
      signal,
    );
    signal.throwIfAborted();
    try {
      return await withLibraryMutation(async () => {
        signal.throwIfAborted();
        jobs.updateResources(jobId, [...(job.resources ?? []), resource]);
        const result = await read(signal);
        signal.throwIfAborted();
        jobs.pageHandoffs.set({
          jobId,
          chapterId,
          pageId,
          phase: "processing",
        });
        return result;
      });
    } catch (error) {
      if (!(error instanceof AppActivityBusyError)) throw error;
    }
  }
}

export function releaseJobPage(
  jobs: ActiveJobStore,
  jobId: string,
  chapterId: string,
  pageId: string,
  failed = false,
): void {
  const job = jobs.get(jobId);
  if (!job?.resources) return;
  const resource = pageContentResource(chapterId, pageId);
  jobs.updateResources(
    jobId,
    job.resources.filter(
      (item) => item.kind !== resource.kind || item.scope !== resource.scope,
    ),
  );
  jobs.pageHandoffs.set({
    jobId,
    chapterId,
    pageId,
    phase: failed ? "failed" : "completed",
  });
}
