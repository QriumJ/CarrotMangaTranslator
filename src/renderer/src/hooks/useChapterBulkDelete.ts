import React from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type {
  DeleteChaptersResult,
  LibraryWorkSummary,
} from "../../../shared/libraryTypes";
import { libraryGateway } from "../api/libraryGateway";
import {
  presentSelection,
  toggleOrderedSelection,
} from "../lib/chapterBulkSelection";
import { formatErrorMessage } from "../lib/errorPresentation";
import type {
  ChapterBulkDeleteController,
  ChapterBulkDeleteOutcome,
} from "./chapterBulkDeleteTypes";
import type { UseLibraryActionsOptions } from "./libraryActionTypes";

type ChapterBulkDeleteOptions = Pick<
  UseLibraryActionsOptions,
  | "askConfirm"
  | "currentChapter"
  | "dirty"
  | "library"
  | "pushStatus"
  | "saveNow"
  | "setLibrary"
> & { clearCurrentChapter: () => void };

export function useChapterBulkDelete(
  options: ChapterBulkDeleteOptions,
): ChapterBulkDeleteController {
  const [workId, setWorkId] = React.useState<string | null>(null);
  const [selection, setSelection] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [busy, setBusy] = React.useState(false);
  const [outcome, setOutcome] = React.useState<ChapterBulkDeleteOutcome | null>(
    null,
  );
  const anchorRef = React.useRef<string | null>(null);
  const work =
    options.library.works.find((candidate) => candidate.id === workId) ?? null;
  const orderedIds = React.useMemo(
    () => work?.chapters.map((chapter) => chapter.id) ?? [],
    [work],
  );
  const selectedIds = React.useMemo(
    () => presentSelection(selection, orderedIds),
    [orderedIds, selection],
  );
  const reset = React.useCallback((nextWorkId: string | null) => {
    anchorRef.current = null;
    setSelection(new Set());
    setOutcome(null);
    setWorkId(nextWorkId);
  }, []);
  const submit = useSubmitChapterBulkDelete({
    ...options,
    finish: () => reset(null),
    selectedIds,
    work,
    setBusy,
    setOutcome,
    setSelection,
  });
  return {
    work,
    selectedIds,
    busy,
    outcome,
    open: reset,
    close: React.useCallback(() => {
      if (!busy) reset(null);
    }, [busy, reset]),
    toggle: (chapterId, checked, extend) => {
      const anchorId = anchorRef.current;
      setSelection((current) =>
        toggleOrderedSelection({
          anchorId,
          checked,
          extend,
          id: chapterId,
          orderedIds,
          selection: current,
        }),
      );
      if (!extend) anchorRef.current = chapterId;
    },
    setAll: (checked) => setSelection(new Set(checked ? orderedIds : [])),
    submit,
  };
}

function useSubmitChapterBulkDelete({
  askConfirm,
  clearCurrentChapter,
  currentChapter,
  dirty,
  finish,
  pushStatus,
  saveNow,
  selectedIds,
  setBusy,
  setLibrary,
  setOutcome,
  setSelection,
  work,
}: ChapterBulkDeleteOptions & {
  finish: () => void;
  selectedIds: string[];
  work: LibraryWorkSummary | null;
  setBusy: (busy: boolean) => void;
  setOutcome: (outcome: ChapterBulkDeleteOutcome | null) => void;
  setSelection: (selection: ReadonlySet<string>) => void;
}): () => Promise<void> {
  const { t } = useTranslation("renderer");
  return React.useCallback(async () => {
    if (!work || selectedIds.length === 0) return;
    const removeCustomOutputs = await confirmBulkDeletion(
      askConfirm,
      work,
      selectedIds,
      t,
    );
    if (removeCustomOutputs === null) return;
    setBusy(true);
    setOutcome(null);
    try {
      if (dirty && currentChapter && selectedIds.includes(currentChapter.id))
        await saveNow();
      const result = await libraryGateway.deleteChapters({
        workId: work.id,
        chapterIds: selectedIds,
        removeCustomOutputs,
      });
      setLibrary(result.library);
      if (
        currentChapter &&
        result.deletedChapterIds.includes(currentChapter.id)
      )
        clearCurrentChapter();
      const deleted = result.deletedChapterIds.length;
      if (result.failures.length === 0) {
        pushStatus(t("library.bulkDelete.success", { count: deleted }));
        finish();
        return;
      }
      showPartialFailure(result, { pushStatus, setOutcome, setSelection, t });
    } catch (error) {
      pushStatus(formatErrorMessage(error, t("library.bulkDelete.failed")));
      setOutcome({ kind: "failed" });
      await refreshLibraryAfterFailure(setLibrary);
    } finally {
      setBusy(false);
    }
  }, [
    askConfirm,
    clearCurrentChapter,
    currentChapter,
    dirty,
    finish,
    pushStatus,
    saveNow,
    selectedIds,
    setBusy,
    setLibrary,
    setOutcome,
    setSelection,
    t,
    work,
  ]);
}

function showPartialFailure(
  result: DeleteChaptersResult,
  {
    pushStatus,
    setOutcome,
    setSelection,
    t,
  }: {
    pushStatus: (line: string) => void;
    setOutcome: (outcome: ChapterBulkDeleteOutcome | null) => void;
    setSelection: (selection: ReadonlySet<string>) => void;
    t: TFunction<"renderer">;
  },
): void {
  // Raw reasons can carry local paths; they go to the log, not the dialog.
  for (const failure of result.failures) console.error(failure);
  // Only failed chapters stay selected so a retry targets exactly them.
  setSelection(new Set(result.failures.map((item) => item.chapterId)));
  setOutcome({
    kind: "partial",
    deleted: result.deletedChapterIds.length,
    failures: result.failures,
  });
  pushStatus(
    t("library.bulkDelete.partial", {
      deleted: result.deletedChapterIds.length,
      failed: result.failures.length,
    }),
  );
}

async function confirmBulkDeletion(
  askConfirm: ChapterBulkDeleteOptions["askConfirm"],
  work: LibraryWorkSummary,
  selectedIds: string[],
  t: TFunction<"renderer">,
): Promise<boolean | null> {
  let removeCustomOutputs = false;
  const titles = work.chapters
    .filter((chapter) => selectedIds.includes(chapter.id))
    .map((chapter) => chapter.title);
  const shown = titles.slice(0, 3).join(", ");
  const confirmed = await askConfirm(
    t("library.bulkDelete.confirmTitle", { count: titles.length }),
    titles.length > 3
      ? t("library.bulkDelete.confirmMessageMore", {
          titles: shown,
          count: titles.length - 3,
        })
      : shown,
    t("library.bulkDelete.confirmDetail", { work: work.title }),
    {
      label: t("library.delete.customOutputs"),
      confirmLabel: t("library.bulkDelete.action", { count: titles.length }),
      destructive: true,
      checked: removeCustomOutputs,
      onChange: (value) => {
        removeCustomOutputs = value;
      },
    },
  );
  return confirmed ? removeCustomOutputs : null;
}

async function refreshLibraryAfterFailure(
  setLibrary: ChapterBulkDeleteOptions["setLibrary"],
): Promise<void> {
  try {
    setLibrary(await libraryGateway.getLibrary());
  } catch (error) {
    // error-policy-allow: the deletion failure is already reported; keep the last list.
    console.error(error);
  }
}
