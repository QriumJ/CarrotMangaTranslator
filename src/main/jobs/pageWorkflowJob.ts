import type {
  PageWorkflowRequest,
  PageWorkflowResult,
} from "../../shared/pageWorkflowTypes";
import { createPageWorkflowProgress } from "./pageWorkflowProgress";
import { PageWorkflowTimingRecorder } from "../pageWorkflow/pageWorkflowTimingRecorder";
import {
  pageWorkflowNeedsExclusiveModel,
  preflightPageWorkflow,
} from "../../shared/pageWorkflowPolicy";
import { executePageWorkflow } from "../application/pageWorkflowService";
import {
  getRunPaths,
  openChapter,
  resolveWorkContextForChapter,
} from "../library";
import { captureWorkInstructions } from "../../shared/workContextInstructions";
import { preparePageWorkflowRun } from "../pageWorkflowRunStore";
import { createPageWorkflowRuntime } from "../pageWorkflow/pageWorkflowRuntime";
import { workflowConfigurationKeys } from "../pageWorkflow/pageWorkflowConfiguration";
import { createDefaultWholePagePipelineDependencies } from "../pipeline/wholePagePipelinePorts";
import { isNonRetriableRuntimeError } from "../pipeline/failure";
import {
  acquireJobPageOwnership,
  assertJobPagesAvailable,
  releaseJobPage,
  reserveJobChapter,
} from "./jobPageOwnership";
import { createJobLifetimeCleanupBoundary } from "./jobLifetimeCleanup";
import { emitJobEvent } from "./jobEvents";
import type { TranslationJobContext } from "./translationJobTypes";
import type { AppPaths } from "../appPaths";
type PageWorkflowJobContext = TranslationJobContext & { appPaths: AppPaths };
import type { AppSettings } from "../../shared/settingsTypes";
import type { JobEvent } from "../../shared/jobTypes";
import type { AppActivityResource } from "../../shared/appActivityTypes";

function workflowResources(
  request: PageWorkflowRequest,
  settings: AppSettings,
): AppActivityResource[] {
  return [
    {
      kind: "model-runtime",
      scope: "*",
      access: pageWorkflowNeedsExclusiveModel(request, settings)
        ? "write"
        : "read",
    },
    ...(request.plan.stages.includes("translate") &&
    settings.modelProvider === "claude-code"
      ? [{ kind: "claude-auth" as const, scope: "*", access: "read" as const }]
      : []),
    ...((request.plan.stages.includes("translate") &&
      settings.modelProvider === "openai-codex") ||
    (request.plan.stages.includes("erase") &&
      request.plan.erasureEngine === "codex")
      ? [{ kind: "codex-auth" as const, scope: "*", access: "read" as const }]
      : []),
  ];
}

export async function startPageWorkflowJob(
  context: PageWorkflowJobContext,
  request: PageWorkflowRequest,
  settings: AppSettings,
): Promise<PageWorkflowResult> {
  if (settings.ocr.pipeline !== "hayai")
    throw new Error("페이지 작업은 HayaiOCR에서만 실행할 수 있습니다.");
  const run = await preparePageWorkflowRun(
    context.appPaths.dataRoot,
    request,
    async (chapterId) =>
      captureWorkInstructions(
        (await resolveWorkContextForChapter(chapterId)).styleGuide,
      ),
  );
  const chapters = await Promise.all(
    run.request.selection.map((s) => openChapter(s.chapterId)),
  );
  const preflight = preflightPageWorkflow(run.request, chapters);
  if (preflight.issues.length)
    return {
      runId: run.id,
      status: "failed",
      issues: preflight.issues,
      chapters,
    };
  const abortController = new AbortController();
  const lifetime = createJobLifetimeCleanupBoundary();
  context.jobs.start({
    id: run.id,
    kind: "gemma-analysis",
    abortController,
    cleanup: lifetime.cleanup,
    resources: workflowResources(run.request, settings),
  });
  const timing = new PageWorkflowTimingRecorder(
    context.appPaths.dataRoot,
    run.id,
    run.request,
    chapters,
  );
  const emit = (event: JobEvent) =>
    emitJobEvent(context.jobs, context.getMainWindow(), {
      ...event,
      executionId: timing.record.attemptId,
    });
  return context.jobs.run(
    run.id,
    () =>
      runWorkflowJobSafely({
        context,
        run,
        settings,
        abortController,
        lifetime,
        emit,
        chapters,
        preflight,
        timing,
      }),
    settings,
  );
}

type WorkflowRun = Awaited<ReturnType<typeof preparePageWorkflowRun>>;
async function runWorkflowJob({
  context,
  run,
  settings,
  abortController,
  lifetime,
  emit,
  chapters,
  preflight,
  timing,
}: {
  context: PageWorkflowJobContext;
  run: WorkflowRun;
  settings: AppSettings;
  abortController: AbortController;
  lifetime: ReturnType<typeof createJobLifetimeCleanupBoundary>;
  emit: (event: JobEvent) => void;
  chapters: Awaited<ReturnType<typeof openChapter>>[];
  preflight: ReturnType<typeof preflightPageWorkflow>;
  timing: PageWorkflowTimingRecorder;
}) {
  const dependencies = workflowDependencies(context.appPaths, settings);
  const total = preflight.pageCount * run.request.plan.stages.length;
  const progress = createPageWorkflowProgress(run.id, total, emit);
  const runtime = createPageWorkflowRuntime({
    runId: run.id,
    ...run.request,
    rules: run.rules,
    instructions: run.instructions,
    settings,
    paths: context.appPaths,
    signal: abortController.signal,
    emit: progress.emit,
    dependencies,
    runPaths: (chapterId) => getRunPaths(chapterId, run.id),
    decodeImage: context.decodeImage,
  });
  lifetime.registerResourceCleanup(runtime.dispose);
  try {
    reserveWorkflowChapters(context, run, chapters);
    const result = await executePageWorkflow(
      {
        runId: run.id,
        ...run.request,
        signal: abortController.signal,
        configurationKeys: workflowConfigurationKeys(settings),
      },
      {
        ...runtime,
        group: (stage, execute) =>
          timing.stage(stage, () => runtime.group(stage, execute)),
        startPageTiming: (stage, chapterId, page) =>
          timing.startPage(stage, chapterId, page),
        skipPageTiming: (stage, chapterId, pageId) =>
          timing.skipPage(stage, chapterId, pageId),
        readChapter: openChapter,
        acquirePage: (chapterId, pageId) =>
          acquireJobPageOwnership(context.jobs, run.id, chapterId, pageId),
        releasePage: (chapterId, pageId) =>
          releaseJobPage(context.jobs, run.id, chapterId, pageId),
        isFatal: isNonRetriableRuntimeError,
        progress: progress.begin,
      },
    );
    return result;
  } finally {
    await timing.cleanup(runtime.dispose);
  }
}

function reserveWorkflowChapters(
  context: PageWorkflowJobContext,
  run: WorkflowRun,
  chapters: Awaited<ReturnType<typeof openChapter>>[],
) {
  const pageIds = (chapterId: string) =>
    run.request.selection.find((s) => s.chapterId === chapterId)?.pageIds ?? [];
  for (const chapter of chapters)
    assertJobPagesAvailable(
      context.jobs,
      run.id,
      chapter.id,
      pageIds(chapter.id),
    );
  for (const chapter of chapters)
    reserveJobChapter(context.jobs, run.id, chapter, pageIds(chapter.id), [
      { kind: "work-context", scope: chapter.workId, access: "write" },
    ]);
}

function emitWorkflowCompletion(
  emit: (event: JobEvent) => void,
  id: string,
  result: PageWorkflowResult,
  total: number,
) {
  emit({
    id,
    kind: "gemma-analysis",
    status: result.status,
    phase: "done",
    progressText: result.issues[0]?.message ?? "페이지 작업 완료",
    progressCurrent: total,
    progressTotal: total,
  });
}

async function runWorkflowJobSafely(
  input: Parameters<typeof runWorkflowJob>[0],
) {
  try {
    await input.timing.checkpoint();
    const result = await runWorkflowJob(input);
    await input.timing.finish(result.status);
    emitWorkflowCompletion(
      input.emit,
      input.run.id,
      result,
      input.preflight.pageCount * input.run.request.plan.stages.length,
    );
    return result;
  } catch (error) {
    await input.timing.finish(
      input.abortController.signal.aborted ? "cancelled" : "failed",
    );
    input.emit({
      id: input.run.id,
      kind: "gemma-analysis",
      status: input.abortController.signal.aborted ? "cancelled" : "failed",
      phase: "failed",
      progressText: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    input.context.jobs.clearIfCurrent(input.run.id);
    input.lifetime.finish();
  }
}

function workflowDependencies(paths: AppPaths, settings: AppSettings) {
  const dependencies = createDefaultWholePagePipelineDependencies(paths);
  dependencies.settings = { getAppSettings: async () => settings };
  return dependencies;
}
