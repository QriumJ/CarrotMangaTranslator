import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { formatErrorMessage } from "../lib/errorPresentation";
import type { RenameTarget } from "../lib/libraryRenameTypes";
import { libraryGateway } from "../api/libraryGateway";
import type { UseLibraryActionsOptions } from "./libraryActionTypes";

type DeleteRenameTargetActionOptions = Pick<
  UseLibraryActionsOptions,
  | "askConfirm"
  | "currentChapter"
  | "dirty"
  | "pushStatus"
  | "saveNow"
  | "setLibrary"
> & {
  clearCurrentChapter: () => void;
  renameTarget: RenameTarget | null;
  setRenameBusy: (busy: boolean) => void;
  setRenameTarget: (target: RenameTarget | null) => void;
};

function deleteSuccessStatus(
  renameTarget: RenameTarget,
  t: TFunction<"renderer">,
): string {
  return renameTarget.kind === "work"
    ? t("library.delete.workSuccess", { title: renameTarget.title })
    : t("library.delete.chapterSuccess", { title: renameTarget.title });
}

function deleteFailureStatus(
  renameTarget: RenameTarget,
  t: TFunction<"renderer">,
): string {
  return renameTarget.kind === "work"
    ? t("library.delete.workFailed")
    : t("library.delete.chapterFailed");
}

function resolveDeleteContext(
  currentChapterId: string | null,
  currentWorkId: string | null,
  renameTarget: RenameTarget,
): {
  isCurrentChapter: boolean;
  isCurrentWork: boolean;
} {
  return {
    isCurrentChapter: currentChapterId === renameTarget.id,
    isCurrentWork:
      renameTarget.kind === "work" && currentWorkId === renameTarget.id,
  };
}

async function deleteLibraryRenameTarget(
  renameTarget: RenameTarget,
  setLibrary: DeleteRenameTargetActionOptions["setLibrary"],
  removeCustomOutputs: boolean,
): Promise<void> {
  const nextLibrary =
    renameTarget.kind === "work"
      ? await libraryGateway.deleteWork(renameTarget.id, removeCustomOutputs)
      : await libraryGateway.deleteChapter(
          renameTarget.id,
          removeCustomOutputs,
        );
  setLibrary(nextLibrary);
}

function clearCurrentSelectionAfterDelete(
  renameTarget: RenameTarget,
  context: ReturnType<typeof resolveDeleteContext>,
  clearCurrentChapter: () => void,
): void {
  if (
    (renameTarget.kind === "work" && context.isCurrentWork) ||
    (renameTarget.kind === "chapter" && context.isCurrentChapter)
  ) {
    clearCurrentChapter();
  }
}

async function confirmDeletion(
  askConfirm: DeleteRenameTargetActionOptions["askConfirm"],
  target: RenameTarget,
  t: TFunction<"renderer">,
): Promise<boolean | null> {
  let removeCustomOutputs = false;
  const confirmed = await askConfirm(
    target.kind === "work"
      ? t("library.delete.workTitle")
      : t("library.delete.chapterTitle"),
    target.title,
    t("library.delete.detail"),
    {
      label: t("library.delete.customOutputs"),
      confirmLabel: t("library.delete.action"),
      destructive: true,
      checked: removeCustomOutputs,
      onChange: (value) => {
        removeCustomOutputs = value;
      },
    },
  );
  return confirmed ? removeCustomOutputs : null;
}

export function useDeleteRenameTargetAction({
  askConfirm,
  clearCurrentChapter,
  currentChapter,
  dirty,
  pushStatus,
  renameTarget,
  saveNow,
  setLibrary,
  setRenameBusy,
  setRenameTarget,
}: DeleteRenameTargetActionOptions): (target?: RenameTarget) => Promise<void> {
  const { t } = useTranslation("renderer");
  const currentChapterId = currentChapter?.id ?? null;
  const currentWorkId = currentChapter?.workId ?? null;

  return useCallback(
    async (target?: RenameTarget) => {
      const selectedTarget = target ?? renameTarget;
      if (!selectedTarget) {
        return;
      }

      const context = resolveDeleteContext(
        currentChapterId,
        currentWorkId,
        selectedTarget,
      );
      const removeCustomOutputs = await confirmDeletion(
        askConfirm,
        selectedTarget,
        t,
      );
      if (removeCustomOutputs === null) return;

      setRenameBusy(true);
      try {
        if ((context.isCurrentChapter || context.isCurrentWork) && dirty) {
          await saveNow();
        }
        await deleteLibraryRenameTarget(
          selectedTarget,
          setLibrary,
          removeCustomOutputs,
        );
        clearCurrentSelectionAfterDelete(
          selectedTarget,
          context,
          clearCurrentChapter,
        );
        pushStatus(deleteSuccessStatus(selectedTarget, t));
        setRenameTarget(null);
      } catch (error) {
        pushStatus(
          formatErrorMessage(error, deleteFailureStatus(selectedTarget, t)),
        );
      } finally {
        setRenameBusy(false);
      }
    },
    [
      askConfirm,
      clearCurrentChapter,
      currentChapterId,
      currentWorkId,
      dirty,
      pushStatus,
      renameTarget,
      saveNow,
      setLibrary,
      setRenameBusy,
      setRenameTarget,
      t,
    ],
  );
}
