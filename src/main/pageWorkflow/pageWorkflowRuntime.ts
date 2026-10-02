import { resolvePreviousChapterStoryPages } from "../previousChapterContext";
import type { ChapterSnapshot, MangaPage } from "../../shared/libraryTypes";
import type { PageWorkflowStage } from "../../shared/pageWorkflowStages";
import { buildBaseOptions, buildPageOptions } from "../pipeline/options";
import { detectWorkflowBlocks, readWorkflowSource } from "./pageWorkflowOcr";
import { translateWorkflowPage } from "./pageWorkflowTranslation";
import { createWorkflowTypography } from "./pageWorkflowTypography";
import { createWorkflowImages } from "./pageWorkflowImages";
import { createWorkflowSessions } from "./pageWorkflowSessions";
import { applyWorkflowRuleStage } from "./pageWorkflowRuleExecution";
import type { PageWorkflowRuntimeContext } from "./pageWorkflowRuntimeTypes";
import type { PageWorkflowContextCommit } from "../application/pageWorkflowContextCommit";
import { savePageWorkflowResult } from "../library";
import { withModelWorkload } from "../runtimeSupport/modelWorkload";

export function createPageWorkflowRuntime(context: PageWorkflowRuntimeContext) {
  const sessions = createWorkflowSessions(context.dependencies.runtime);
  context = {
    ...context,
    dependencies: { ...context.dependencies, runtime: sessions.runtime },
  };
  const images = createWorkflowImages(context);
  const typography = createWorkflowTypography(context);
  let pending: PageWorkflowContextCommit = {};
  let disposal: Promise<void> | undefined;
  context.dependencies.pageContext = {
    saveChapterStoryMemory: async (memory) => {
      pending.storyMemory = memory;
      return memory;
    },
    saveWorkStyleGuide: async (guide) => {
      pending.styleGuide = guide;
      return guide;
    },
  };
  return {
    group: <T>(stage: PageWorkflowStage, run: () => Promise<T>) =>
      stage === "erase"
        ? withModelWorkload("inpainting", context.signal, run)
        : stage.endsWith("-rules") || stage === "review"
          ? withModelWorkload("page-renderer", context.signal, run)
          : run(),
    finishStage: sessions.close,
    restoreCompletedStage: async (
      stage: PageWorkflowStage,
      page: MangaPage,
    ) => {
      if (stage === "typography") await typography.apply(page);
    },
    save: async (chapterId: string, before: MangaPage, after: MangaPage) => {
      const commit =
        after.pageWorkflow?.steps.translate?.status === "completed"
          ? pending
          : {};
      await savePageWorkflowResult(chapterId, before, after, commit);
      pending = {};
    },
    prepareStage: async (
      stage: PageWorkflowStage,
      chapter: ChapterSnapshot,
      pageIds: string[],
    ) => {
      if (stage === "translate" && context.plan.cumulative)
        context.previousStoryPages =
          await resolvePreviousChapterStoryPages(chapter);
      if (stage === "typography") await typography.prepare(chapter, pageIds);
    },
    execute: async (
      stage: PageWorkflowStage,
      chapter: ChapterSnapshot,
      page: MangaPage,
    ): Promise<MangaPage> => {
      pending = {};
      if (stage === "detect" || stage === "ocr")
        return withSessionFailureCleanup(sessions, () =>
          executeWorkflowRecognition(context, chapter, page, stage),
        );
      if (!page.blocks.length) return page;
      if (stage === "translate")
        return withSessionFailureCleanup(sessions, () =>
          translateWorkflowPage(context, chapter, page),
        );
      if (stage === "typography") return typography.apply(page);
      if (stage === "erase") return images.erase(page);
      if (stage === "layout") return images.layout(page);
      return applyWorkflowRuleStage(context, chapter, page, stage);
    },
    dispose: () => (disposal ??= disposeWorkflowResources(sessions, context)),
  };
}

async function withSessionFailureCleanup(
  sessions: ReturnType<typeof createWorkflowSessions>,
  run: () => Promise<MangaPage>,
) {
  try {
    return await run();
  } catch (error) {
    try {
      await sessions.close();
    } catch (cleanupError) {
      throw Object.assign(
        new AggregateError(
          [error, cleanupError],
          "페이지 처리와 런타임 종료에 실패했습니다.",
          { cause: cleanupError },
        ),
        { nonRetriable: true },
      );
    }
    throw error;
  }
}

async function disposeWorkflowResources(
  sessions: ReturnType<typeof createWorkflowSessions>,
  context: PageWorkflowRuntimeContext,
) {
  const results = await Promise.allSettled([
    sessions.dispose(),
    context.dependencies.fontMatching.pageInference?.dispose?.(),
  ]);
  const errors = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  if (errors.length)
    throw new AggregateError(errors, "페이지 작업 정리에 실패했습니다.");
}

async function executeWorkflowRecognition(
  context: PageWorkflowRuntimeContext,
  chapter: ChapterSnapshot,
  page: MangaPage,
  stage: "detect" | "ocr",
) {
  const paths = await context.runPaths(chapter.id);
  const base = buildBaseOptions(
    context.runId,
    paths.runDir,
    context.settings,
    context.paths,
  );
  const options = buildPageOptions(
    base,
    page,
    chapter.pages.findIndex((p) => p.id === page.id),
    1,
  );
  options.abortSignal = context.signal;
  return stage === "detect"
    ? detectWorkflowBlocks(page, options, context.plan)
    : readWorkflowSource(
        page,
        options,
        context.plan,
        context.dependencies.runtime,
      );
}
