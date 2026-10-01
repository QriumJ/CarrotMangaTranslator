import type { Dispatch, SetStateAction } from "react";
import type {
  ImportCreateSelection,
  ImportPreviewResult,
} from "../../../shared/importTypes";
import type { LibraryIndex } from "../../../shared/libraryTypes";
import type { LinkedWorkspaceImportOptions } from "../../../shared/linkedWorkspaceTypes";
import type { ImportModalSubmit } from "../lib/importFlowTypes";

export type ImportTargetMode = "new" | "existing";

type SelectionSetter = Dispatch<SetStateAction<ImportCreateSelection[]>>;

export function updateSelectionEnabled(
  setSelections: SelectionSetter,
  draftId: string,
  enabled: boolean,
): void {
  setSelections((current) =>
    current.map((item) =>
      item.draftId === draftId ? { ...item, enabled } : item,
    ),
  );
}

export function updateSelectionTitle(
  setSelections: SelectionSetter,
  draftId: string,
  title: string,
): void {
  setSelections((current) =>
    current.map((item) =>
      item.draftId === draftId ? { ...item, title } : item,
    ),
  );
}

export function buildImportSubmitPayload(
  targetMode: ImportTargetMode,
  newWorkTitle: string,
  existingWorkId: string,
  selections: ImportCreateSelection[],
  linkedWorkspace?: LinkedWorkspaceImportOptions,
): ImportModalSubmit {
  return {
    target:
      targetMode === "new"
        ? { mode: "new", title: newWorkTitle }
        : { mode: "existing", workId: existingWorkId },
    selections,
    ...(linkedWorkspace ? { linkedWorkspace } : {}),
  };
}

export function isImportSubmittable(
  targetMode: ImportTargetMode,
  newWorkTitle: string,
  existingWorkId: string,
  selections: ImportCreateSelection[],
): boolean {
  if (targetMode === "new" && !newWorkTitle.trim()) {
    return false;
  }
  if (targetMode === "existing" && !existingWorkId) {
    return false;
  }
  return selections.some(
    (selection) => selection.enabled && selection.title.trim(),
  );
}

export function resolveImportModalInitialState(
  library: LibraryIndex,
  currentWorkId: string | null,
  preview: ImportPreviewResult,
  initialDraft: ImportModalSubmit | null,
) {
  const currentWorkAvailable = Boolean(
    currentWorkId && library.works.some((work) => work.id === currentWorkId),
  );
  return {
    currentWorkId: currentWorkAvailable ? currentWorkId : null,
    existingWorkId: resolveInitialExistingWorkId(
      library,
      currentWorkId,
      currentWorkAvailable,
      initialDraft,
    ),
    targetMode: resolveInitialTargetMode(currentWorkAvailable, initialDraft),
    newWorkTitle: resolveInitialWorkTitle(preview, initialDraft),
    selections: resolveInitialSelections(preview, initialDraft),
    linkedWorkspace: initialDraft?.linkedWorkspace ?? {
      enabled: true,
      outputFormat: "source" as const,
      jpegQuality: 95,
      webpQuality: 90,
    },
  };
}

function resolveInitialExistingWorkId(
  library: LibraryIndex,
  currentWorkId: string | null,
  currentWorkAvailable: boolean,
  initialDraft: ImportModalSubmit | null,
): string {
  if (initialDraft?.target.mode === "existing") {
    return initialDraft.target.workId;
  }
  if (currentWorkAvailable) return currentWorkId ?? "";
  return library.works[0]?.id ?? "";
}

function resolveInitialTargetMode(
  currentWorkAvailable: boolean,
  initialDraft: ImportModalSubmit | null,
): ImportTargetMode {
  if (initialDraft && initialDraft.target.mode !== "chapter")
    return initialDraft.target.mode;
  return currentWorkAvailable ? "existing" : "new";
}

function resolveInitialWorkTitle(
  preview: ImportPreviewResult,
  initialDraft: ImportModalSubmit | null,
): string {
  return initialDraft?.target.mode === "new"
    ? initialDraft.target.title
    : preview.suggestedWorkTitle;
}

function resolveInitialSelections(
  preview: ImportPreviewResult,
  initialDraft: ImportModalSubmit | null,
): ImportCreateSelection[] {
  return preview.chapters.map(
    (chapter) =>
      initialDraft?.selections.find(
        (selection) => selection.draftId === chapter.draftId,
      ) ?? {
        draftId: chapter.draftId,
        title: chapter.title,
        enabled: true,
      },
  );
}
