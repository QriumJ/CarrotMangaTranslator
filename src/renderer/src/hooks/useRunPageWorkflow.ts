import { useCallback, useRef } from "react";
import type { PageWorkflowRequest } from "../../../shared/pageWorkflowTypes";
import type { AppActivityState } from "../../../shared/appActivityTypes";
import type { LibraryIndex } from "../../../shared/libraryTypes";
import { pageWorkflowGateway } from "../api/pageWorkflowGateway";
import type { UseTranslationActionsOptions } from "./translationActionTypes";
import type { NotificationPort } from "../lib/notificationPort";
import { formatErrorMessage } from "../lib/errorPresentation";
import { pageWorkflowNeedsExclusiveModel } from "../../../shared/pageWorkflowPolicy";

/**
 * API/Codex plans run beside other shared jobs; local Gemma or local erasure
 * waits for every model job. Pages or a work context another run holds are
 * reported here too, and the main process re-checks all of it on start.
 */
export function pageWorkflowStartIssue(
  request: PageWorkflowRequest,
  options: {
    activities?: AppActivityState | null;
    exclusiveFlowActiveRef?: { readonly current: boolean };
    jobActive: boolean;
    library: Pick<LibraryIndex, "works">;
    modelResourceBusy?: boolean;
    settings?: { modelProvider?: string } | null;
  },
): string | null {
  if (options.exclusiveFlowActiveRef?.current)
    return "진행 중인 번역 흐름이 끝난 뒤 시작할 수 있습니다.";
  const exclusive = pageWorkflowNeedsExclusiveModel(request, options.settings);
  if (
    exclusive
      ? (options.modelResourceBusy ?? options.jobActive)
      : options.jobActive
  )
    return exclusive
      ? "로컬 모델을 쓰는 작업이라 다른 AI 작업이 끝난 뒤 시작할 수 있습니다."
      : "로컬 모델을 독점하는 작업이 끝난 뒤 시작할 수 있습니다.";
  const state = options.activities;
  if (!state) return null;
  const selected = new Set(
    request.selection.flatMap((entry) =>
      entry.pageIds.map((pageId) => `${entry.chapterId}/${pageId}`),
    ),
  );
  const busyPages = state.pages.filter(
    (page) =>
      page.phase !== "completed" &&
      page.phase !== "failed" &&
      selected.has(`${page.chapterId}/${page.pageId}`),
  ).length;
  if (busyPages > 0)
    return `다른 작업이 처리 중인 페이지 ${busyPages}개가 선택되어 있습니다.`;
  const workIds = new Set(
    request.selection.flatMap(
      (entry) =>
        options.library.works.find((work) =>
          work.chapters.some((chapter) => chapter.id === entry.chapterId),
        )?.id ?? [],
    ),
  );
  const contextBusy = state.activities.some((activity) =>
    activity.resources?.some(
      (resource) =>
        resource.kind === "work-context" &&
        resource.access === "write" &&
        workIds.has(resource.scope),
    ),
  );
  return contextBusy
    ? "같은 작품의 번역 문맥을 다른 작업이 쓰고 있어 그 작업이 끝난 뒤 시작할 수 있습니다."
    : null;
}

export function useRunPageWorkflow(
  options: UseTranslationActionsOptions,
  notifications: NotificationPort,
) {
  const starting = useRef(false);
  return useCallback(
    async (request: PageWorkflowRequest) => {
      if (starting.current || pageWorkflowStartIssue(request, options)) return;
      starting.current = true;
      options.setFlowActive(true, "shared");
      try {
        await options.beforeTranslate?.();
        await options.saveNow();
        const before = options.currentChapterRef.current;
        const pending = pageWorkflowGateway.startPageWorkflow(request);
        // The job is registered once the request is in flight; another page
        // workflow may start now without waiting for this one to finish.
        starting.current = false;
        const result = await pending;
        options.clearPageImageCache();
        adoptWorkflowResult(options, request, result, before);
        await options.refreshLibrary();
        options.setShowBlockChrome(true);
        if (result.issues.length)
          notifications.warn(
            result.issues.map((issue) => issue.message).join("\n"),
          );
        options.pushStatus(
          result.status === "completed"
            ? "페이지 작업 완료"
            : "페이지 작업이 중단되었습니다. 같은 실행을 이어갈 수 있습니다.",
        );
      } catch (error) {
        notifications.error(
          formatErrorMessage(error, "페이지 작업에 실패했습니다."),
        );
      } finally {
        starting.current = false;
        options.setFlowActive(false, "shared");
      }
    },
    [options, notifications],
  );
}

function adoptWorkflowResult(
  options: UseTranslationActionsOptions,
  request: PageWorkflowRequest,
  result: Awaited<ReturnType<typeof pageWorkflowGateway.startPageWorkflow>>,
  before: UseTranslationActionsOptions["currentChapter"],
) {
  for (const chapter of result.chapters) {
    options.mergeLiveChapter(chapter);
    for (const pageId of request.selection.find(
      (s) => s.chapterId === chapter.id,
    )?.pageIds ?? [])
      options.syncSavedPageVersion(chapter, pageId);
    if (before?.id === chapter.id)
      options.recordTranslationCheckpoint?.({
        before,
        after: chapter,
        pageIds:
          request.selection.find((s) => s.chapterId === chapter.id)?.pageIds ??
          [],
        label: "페이지 작업",
      });
  }
}
