import React from "react";
import type { BlockStylePreset } from "../../../shared/blockStylePresets";
import {
  ConditionalBatchSchemeDraftV2Schema,
  createBlankBatchSchemeDraft,
  createConditionalBatchClientId,
  createConditionalBatchRecipeDraft,
  type ConditionalBatchRecipeId,
  type ConditionalBatchSchemeDraftV2,
  type ConditionalBatchSchemeV2,
  type ConditionalBatchSnapshotV2,
} from "../../../shared/conditionalBatchRules";
export type ConditionalBatchApplyNotice = {
  kind: "success" | "warning" | "info";
  message: string;
} | null;
export type ConditionalBatchParsedDraft = ReturnType<
  typeof ConditionalBatchSchemeDraftV2Schema.safeParse
>;
export type ConditionalBatchStorageState = {
  autosaveState: "idle" | "waiting" | "saving" | "saved" | "error";
  storageBusy: boolean;
  storageError: string | null;
};
export type ControllerOptions = {
  initialFind?: string;
  initialReplace?: string;
  blockStylePresets?: readonly BlockStylePreset[];
};
export type ConditionalBatchTemporaryScheme = {
  id: string;
  name: string;
  dirty: boolean;
};
export type TemporaryDraftSession = {
  id: string;
  draft: ConditionalBatchSchemeDraftV2;
  baseline: string;
};
export type SchemeSelectionContext = {
  options: ControllerOptions;
  draft: ConditionalBatchSchemeDraftV2;
  temporaryDrafts: TemporaryDraftSession[];
  selectedSchemeId: string;
  snapshot: ConditionalBatchSnapshotV2 | null;
  setDraft: React.Dispatch<React.SetStateAction<ConditionalBatchSchemeDraftV2>>;
  setTemporaryDrafts: React.Dispatch<
    React.SetStateAction<TemporaryDraftSession[]>
  >;
  setSelectedSchemeId: React.Dispatch<React.SetStateAction<string>>;
  setApplyNotice: React.Dispatch<
    React.SetStateAction<ConditionalBatchApplyNotice>
  >;
  setRecipePickerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRecipePickerCanClose: React.Dispatch<React.SetStateAction<boolean>>;
  setStorageError: React.Dispatch<React.SetStateAction<string | null>>;
  setAutosaveState: React.Dispatch<
    React.SetStateAction<ConditionalBatchStorageState["autosaveState"]>
  >;
  invalidateSave: () => void;
  acceptSavedDraft: (value: string) => void;
};
export function copySavedSchemeAsDraft(
  scheme: ConditionalBatchSchemeV2,
): ConditionalBatchSchemeDraftV2 {
  return structuredClone({
    name: scheme.name,
    description: scheme.description,
    match: scheme.match,
    actions: scheme.actions,
  });
}
function regenerateDraftIds(
  draft: ConditionalBatchSchemeDraftV2,
): ConditionalBatchSchemeDraftV2 {
  return {
    ...draft,
    match: {
      ...draft.match,
      conditions: draft.match.conditions.map((condition) => ({
        ...condition,
        id: createConditionalBatchClientId("condition"),
      })),
      groups: draft.match.groups.map((group) => ({
        ...group,
        id: createConditionalBatchClientId("group"),
        conditions: group.conditions.map((condition) => ({
          ...condition,
          id: createConditionalBatchClientId("condition"),
        })),
      })),
    },
    actions: draft.actions.map((action) => ({
      ...action,
      id: createConditionalBatchClientId("action"),
    })),
  };
}
export function stableDraftString(
  draft: ConditionalBatchSchemeDraftV2,
): string {
  return JSON.stringify(draft);
}
function createCopyName(name: string): string {
  const suffix = " 복사본";
  return name.slice(0, Math.max(1, 80 - suffix.length)) + suffix;
}
export function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function createTemporarySchemeId(): string {
  return `draft:${createConditionalBatchClientId("session")}`;
}
export function switchToSavedScheme(
  state: SchemeSelectionContext,
  selected: ConditionalBatchSchemeV2,
): void {
  const {
    setSelectedSchemeId,
    setDraft,
    setStorageError,
    setApplyNotice,
    setAutosaveState,
    setRecipePickerOpen,
    setRecipePickerCanClose,
  } = state;
  setSelectedSchemeId(selected.id);
  const nextDraft = copySavedSchemeAsDraft(selected);
  setDraft(nextDraft);
  state.acceptSavedDraft(
    stableDraftString(ConditionalBatchSchemeDraftV2Schema.parse(nextDraft)),
  );
  setStorageError(null);
  setApplyNotice(null);
  setAutosaveState("idle");
  setRecipePickerOpen(false);
  setRecipePickerCanClose(false);
}

export function selectScheme(state: SchemeSelectionContext, id: string): void {
  const {
    selectedSchemeId,
    temporaryDrafts,
    setSelectedSchemeId,
    setDraft,
    setStorageError,
    setApplyNotice,
    setAutosaveState,
    setRecipePickerOpen,
    setRecipePickerCanClose,
    snapshot,
  } = state;
  if (id === selectedSchemeId) return;
  const temporary = temporaryDrafts.find((entry) => entry.id === id);
  if (temporary) {
    state.invalidateSave();
    setSelectedSchemeId(id);
    setDraft(structuredClone(temporary.draft));
    state.acceptSavedDraft("");
    setStorageError(null);
    setApplyNotice(null);
    setAutosaveState("idle");
    setRecipePickerOpen(false);
    setRecipePickerCanClose(false);
    return;
  }
  const selected = snapshot?.schemes.find((entry) => entry.id === id);
  if (!selected) return;
  switchToSavedScheme(state, selected);
}

export function resetToRecipe(
  state: SchemeSelectionContext,
  recipeId: ConditionalBatchRecipeId,
  preset?: BlockStylePreset,
): void {
  const {
    options,
    setSelectedSchemeId,
    setDraft,
    setTemporaryDrafts,
    setStorageError,
    setApplyNotice,
    setAutosaveState,
    setRecipePickerOpen,
    setRecipePickerCanClose,
  } = state;
  const next = createConditionalBatchRecipeDraft(recipeId, {
    find: options.initialFind,
    replace: options.initialReplace,
    stylePreset: preset
      ? {
          id: preset.id,
          name: preset.name,
          groupIds: preset.groupIds,
          format: preset.format,
        }
      : undefined,
  });
  const id = createTemporarySchemeId();
  setSelectedSchemeId(id);
  setDraft(next);
  setTemporaryDrafts((current) => [
    ...current,
    { id, draft: next, baseline: stableDraftString(next) },
  ]);
  state.acceptSavedDraft("");
  setStorageError(null);
  setApplyNotice(null);
  setAutosaveState("idle");
  setRecipePickerOpen(false);
  setRecipePickerCanClose(false);
}

export function removeTemporaryScheme(state: SchemeSelectionContext): void {
  const {
    temporaryDrafts,
    selectedSchemeId,
    setTemporaryDrafts,
    setSelectedSchemeId,
    setDraft,
    setRecipePickerOpen,
    setRecipePickerCanClose,
    snapshot,
    setStorageError,
    setApplyNotice,
    setAutosaveState,
  } = state;
  state.invalidateSave();
  const remaining = temporaryDrafts.filter(
    (session) => session.id !== selectedSchemeId,
  );
  const fallbackTemporary = remaining.at(-1);
  setTemporaryDrafts(remaining);
  if (fallbackTemporary) {
    setSelectedSchemeId(fallbackTemporary.id);
    setDraft(structuredClone(fallbackTemporary.draft));
    state.acceptSavedDraft("");
    setRecipePickerOpen(false);
    setRecipePickerCanClose(false);
  } else {
    const fallbackStored = snapshot?.schemes[0];
    if (fallbackStored) {
      switchToSavedScheme(state, fallbackStored);
    } else {
      const next = createBlankBatchSchemeDraft();
      const id = createTemporarySchemeId();
      setSelectedSchemeId(id);
      setDraft(next);
      setTemporaryDrafts([
        { id, draft: next, baseline: stableDraftString(next) },
      ]);
      state.acceptSavedDraft("");
      setRecipePickerOpen(true);
      setRecipePickerCanClose(false);
    }
  }
  setStorageError(null);
  setApplyNotice(null);
  setAutosaveState("idle");
}

export function duplicateScheme(state: SchemeSelectionContext): void {
  const {
    draft,
    setDraft,
    setSelectedSchemeId,
    setTemporaryDrafts,
    setAutosaveState,
    setApplyNotice,
  } = state;
  const duplicate = regenerateDraftIds(structuredClone(draft));
  duplicate.name = createCopyName(draft.name);
  const id = createTemporarySchemeId();
  setDraft(duplicate);
  setSelectedSchemeId(id);
  setTemporaryDrafts((current) => [
    ...current,
    { id, draft: duplicate, baseline: stableDraftString(duplicate) },
  ]);
  state.acceptSavedDraft("");
  setAutosaveState("idle");
  setApplyNotice(null);
}
