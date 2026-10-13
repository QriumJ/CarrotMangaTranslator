import { useCallback } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type {
  CreateImportResult,
  ImportPreviewSession,
} from "../../../shared/importTypes";
import { libraryGateway as mangaGateway } from "../api/libraryGateway";
import type { ImportModalSubmit } from "../lib/importFlowTypes";
import type {
  ErrorMessageFormatter,
  ImportShareActions,
  UseImportShareActionsOptions,
} from "./importShareActionTypes";
import { finishImportedChapterNavigation } from "./importedChapterNavigation";
import { handoffActiveModalToWorkCenter } from "../lib/modalWorkCenterHandoff";
import { toast } from "../lib/toastStore";

// eslint-disable-next-line max-lines-per-function -- draft recovery, commit boundary, refresh, and navigation safety form one transaction
export function useSubmitImportAction(
  {
    applyChapter,
    dirty,
    getNavigationKey,
    importPreview,
    openTranslateOptions,
    pushStatus,
    refreshLibrary,
    resetWorkspaceHistory,
    saveNow,
    setImportBusy,
    setImportModalOpen = NOOP_BOOLEAN_DISPATCH,
    setImportDraft = NOOP_IMPORT_DRAFT_DISPATCH,
    setImportFeedback = NOOP_IMPORT_FEEDBACK_DISPATCH,
    setImportPreview,
  }: UseImportShareActionsOptions,
  formatErrorMessage: ErrorMessageFormatter,
): ImportShareActions["submitImport"] {
  const { t } = useTranslation("renderer");
  return useCallback(
    async (payload: ImportModalSubmit) => {
      if (!importPreview) return;
      const navigationKey = getNavigationKey();
      setImportDraft(payload);
      setImportFeedback(null);
      handoffActiveModalToWorkCenter();
      setImportModalOpen(false);
      setImportBusy(true);
      try {
        let result: CreateImportResult;
        try {
          result = await commitImport(dirty, importPreview, payload, saveNow);
        } catch (error) {
          restoreFailedImport(
            error,
            { pushStatus, setImportFeedback, setImportModalOpen },
            t,
            formatErrorMessage,
          );
          return;
        }
        // A returned result means the transaction committed and the preview
        // was consumed. Later failures must never reopen stale input.
        setImportPreview(null);
        await finishCommittedImport(
          {
            applyChapter,
            openTranslateOptions,
            pushStatus,
            refreshLibrary,
            resetWorkspaceHistory,
            saveNow,
            getNavigationKey,
          },
          payload,
          importPreview.mode,
          result,
          navigationKey,
          t,
          formatErrorMessage,
        );
      } finally {
        setImportBusy(false);
      }
    },
    [
      applyChapter,
      dirty,
      getNavigationKey,
      importPreview,
      openTranslateOptions,
      pushStatus,
      refreshLibrary,
      resetWorkspaceHistory,
      saveNow,
      setImportBusy,
      setImportDraft,
      setImportFeedback,
      setImportModalOpen,
      setImportPreview,
      t,
      formatErrorMessage,
    ],
  );
}

async function commitImport(
  dirty: boolean,
  preview: ImportPreviewSession,
  {
    target,
    selections,
    linkedWorkspace,
    skipDuplicateChapterTitles,
  }: ImportModalSubmit,
  saveNow: () => Promise<void>,
): Promise<CreateImportResult> {
  if (dirty) await saveNow();
  // Renderer-only choices (e.g. opening translation settings) stay here.
  return mangaGateway.createImport({
    previewId: preview.previewId,
    target,
    selections,
    ...(linkedWorkspace ? { linkedWorkspace } : {}),
    ...(skipDuplicateChapterTitles && target.mode === "existing"
      ? { skipDuplicateChapterTitles: true }
      : {}),
  });
}

function restoreFailedImport(
  error: unknown,
  actions: Pick<
    UseImportShareActionsOptions,
    "pushStatus" | "setImportFeedback" | "setImportModalOpen"
  >,
  t: TFunction<"renderer">,
  formatErrorMessage: ErrorMessageFormatter,
): void {
  const cancelled = isAbortLike(error);
  const message = formatErrorMessage(
    error,
    t(cancelled ? "import.cancelled" : "import.applyFailed"),
  );
  actions.setImportFeedback?.({
    message,
    variant: cancelled ? "info" : "danger",
  });
  actions.setImportModalOpen?.(true);
  actions.pushStatus(message);
}

async function finishCommittedImport(
  actions: Pick<
    UseImportShareActionsOptions,
    | "applyChapter"
    | "openTranslateOptions"
    | "pushStatus"
    | "refreshLibrary"
    | "resetWorkspaceHistory"
    | "saveNow"
    | "getNavigationKey"
  >,
  payload: ImportModalSubmit,
  mode: ImportPreviewSession["mode"],
  result: CreateImportResult,
  navigationKey: string,
  t: TFunction<"renderer">,
  formatErrorMessage: ErrorMessageFormatter,
): Promise<void> {
  try {
    await actions.refreshLibrary();
  } catch (error) {
    actions.pushStatus(
      formatErrorMessage(error, t("library.refreshAfterJobFailed")),
    );
  }
  if (isAllSkippedImport(result)) {
    // Nothing new: stay where the user is and open nothing.
    const status = t("import.allSkipped", {
      count: result.skippedChapters?.length,
    });
    actions.pushStatus(status);
    toast.info(status);
    return;
  }
  await finishImportedChapterNavigation({
    applyChapter: actions.applyChapter,
    chapter: result.openedChapter,
    getNavigationKey: actions.getNavigationKey,
    navigationKey,
    openTranslateOptions: actions.openTranslateOptions,
    openWorkTranslation: shouldOpenWorkTranslation(payload, mode, result),
    addedPageIds: payload.translateAddedPages ? result.addedPageIds : undefined,
    refreshChapter: Boolean(result.addedPageIds),
    pushStatus: actions.pushStatus,
    resetWorkspaceHistory: actions.resetWorkspaceHistory,
    saveNow: actions.saveNow,
    status: resolveImportStatus(result, t),
  });
  if (result.linkedWorkspaceWarning) {
    actions.pushStatus(result.linkedWorkspaceWarning);
  }
}

function isAllSkippedImport(result: CreateImportResult): boolean {
  return (
    !result.addedPageIds &&
    result.chapterIds.length === 0 &&
    (result.skippedChapters?.length ?? 0) > 0
  );
}

/** Settings open only for imported chapters, and never start a run. */
function shouldOpenWorkTranslation(
  payload: ImportModalSubmit,
  mode: ImportPreviewSession["mode"],
  result: CreateImportResult,
): boolean {
  return (
    !result.addedPageIds &&
    mode === "batch" &&
    result.chapterIds.length > 0 &&
    (payload.openTranslationAfterImport ?? true)
  );
}

function resolveImportStatus(
  result: CreateImportResult,
  t: TFunction<"renderer">,
): string {
  if (result.addedPageIds) {
    return t("import.pagesAdded", { count: result.addedPageIds.length });
  }
  const skipped = result.skippedChapters?.length ?? 0;
  return skipped > 0
    ? t("import.addedWithSkipped", {
        count: result.chapterIds.length,
        skipped,
      })
    : t("import.added", { count: result.chapterIds.length });
}

function isAbortLike(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\bAbortError\b|operation aborted|cancel import/i.test(message);
}

const NOOP_BOOLEAN_DISPATCH: NonNullable<
  UseImportShareActionsOptions["setImportModalOpen"]
> = () => undefined;
const NOOP_IMPORT_DRAFT_DISPATCH: NonNullable<
  UseImportShareActionsOptions["setImportDraft"]
> = () => undefined;
const NOOP_IMPORT_FEEDBACK_DISPATCH: NonNullable<
  UseImportShareActionsOptions["setImportFeedback"]
> = () => undefined;
