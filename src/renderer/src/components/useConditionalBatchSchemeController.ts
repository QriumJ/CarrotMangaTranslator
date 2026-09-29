import React from "react";
import type { BlockStylePreset } from "../../../shared/blockStylePresets";
import { formatConditionalBatchValidationIssue } from "../../../shared/conditionalBatchErrorPresentation";
import {
  CONDITIONAL_BATCH_STARTER_SCHEME_IDS,
  createConditionalBatchRecipeDraft,
  createEmptyConditionalBatchSnapshot,
  type ConditionalBatchRecipeId,
  type ConditionalBatchSchemeDraftV2,
  type ConditionalBatchSequenceV2,
} from "../../../shared/conditionalBatchRules";
import { conditionalBatchGateway } from "../api/conditionalBatchGateway";
import {
  ConditionalBatchApplyNotice,
  ControllerOptions,
  TemporaryDraftSession,
  createTemporarySchemeId,
  duplicateScheme,
  readErrorMessage,
  removeTemporaryScheme,
  resetToRecipe,
  selectScheme,
  stableDraftString,
  switchToSavedScheme,
} from "./conditionalBatchSchemeDrafts";
import { useConditionalBatchSchemeFavorites } from "./useConditionalBatchSchemeFavorites";
import { useConditionalBatchSchemePersistence } from "./useConditionalBatchSchemePersistence";
import { useConditionalBatchYamlExchange } from "./useConditionalBatchYamlExchange";
export function useConditionalBatchSchemeController(
  options: ControllerOptions = {},
) {
  const session = useSchemeDraftSession(options);
  const persistence = useConditionalBatchSchemePersistence({
    draft: session.draft,
    selectedSchemeId: session.selectedSchemeId,
    onSaved: (savedId, stored) => {
      session.setSelectedSchemeId(savedId);
      if (!stored)
        session.setTemporaryDrafts((current) =>
          current.filter((entry) => entry.id !== session.selectedSchemeId),
        );
    },
  });
  const context = { ...session, ...persistence, options };
  const yaml = useConditionalBatchYamlExchange({
    draft: session.draft,
    parsedDraft: persistence.parsedDraft,
    stored: persistence.stored,
    selectedSchemeId: session.selectedSchemeId,
    runWithSavedDraft: persistence.runWithSavedDraft,
    setStorageBusy: persistence.setStorageBusy,
    setSnapshot: persistence.setSnapshot,
    switchToSavedScheme: (selected) => switchToSavedScheme(context, selected),
    changeDraft: (next) => changeDraft(next),
  });
  const changeDraft = useDraftChange(session, persistence, yaml);

  const favorites = useConditionalBatchSchemeFavorites();
  return createSchemeControllerView(context, yaml, favorites, changeDraft);
}
function useSchemeDraftSession(options: ControllerOptions) {
  const initialDraft = React.useMemo(
    () =>
      createConditionalBatchRecipeDraft(
        options.initialFind ? "findReplace" : "blank",
        { find: options.initialFind, replace: options.initialReplace },
      ),
    [options.initialFind, options.initialReplace],
  );
  const initialTemporaryId = React.useMemo(() => createTemporarySchemeId(), []);
  const [draft, setDraft] =
    React.useState<ConditionalBatchSchemeDraftV2>(initialDraft);
  const [temporaryDrafts, setTemporaryDrafts] = React.useState<
    TemporaryDraftSession[]
  >(() => [
    {
      id: initialTemporaryId,
      draft: initialDraft,
      baseline: stableDraftString(initialDraft),
    },
  ]);
  const [selectedSchemeId, setSelectedSchemeId] =
    React.useState(initialTemporaryId);
  const [applyNotice, setApplyNotice] =
    React.useState<ConditionalBatchApplyNotice>(null);
  const [recipePickerOpen, setRecipePickerOpen] = React.useState(
    !options.initialFind,
  );
  const [recipePickerCanClose, setRecipePickerCanClose] = React.useState(false);
  return {
    draft,
    temporaryDrafts,
    selectedSchemeId,
    applyNotice,
    recipePickerOpen,
    recipePickerCanClose,
    setDraft,
    setTemporaryDrafts,
    setSelectedSchemeId,
    setApplyNotice,
    setRecipePickerOpen,
    setRecipePickerCanClose,
  };
}
type SchemeControllerContext = ReturnType<typeof useSchemeDraftSession> &
  ReturnType<typeof useConditionalBatchSchemePersistence> & {
    options: ControllerOptions;
  };

async function deleteScheme(context: SchemeControllerContext): Promise<void> {
  const { stored, selectedSchemeId, setSnapshot, setStorageError } = context;
  if (!context.canStartWrite()) return;
  if (!stored) {
    removeTemporaryScheme(context);
    return;
  }
  context.beginDelete();
  try {
    const next =
      await conditionalBatchGateway.deleteConditionalBatchScheme(
        selectedSchemeId,
      );
    setSnapshot(next);
    const fallback = next.schemes[0];
    if (fallback) {
      switchToSavedScheme(context, fallback);
    } else {
      resetToRecipe(context, "ellipsis");
    }
  } catch (error) {
    setStorageError(readErrorMessage(error));
  } finally {
    context.finishDelete();
  }
}

async function saveSequence(
  context: SchemeControllerContext,
  sequence: ConditionalBatchSequenceV2,
): Promise<boolean> {
  const { runWithSavedDraft, setSnapshot, setStorageError } = context;
  return runWithSavedDraft(async () => {
    setSnapshot(
      await conditionalBatchGateway.saveConditionalBatchSequence(sequence),
    );
    setStorageError(null);
  });
}

async function deleteSequence(
  context: SchemeControllerContext,
  id: string,
): Promise<void> {
  const { setStorageBusy, setSnapshot, setStorageError } = context;
  setStorageBusy(true);
  try {
    setSnapshot(
      await conditionalBatchGateway.deleteConditionalBatchSequence(id),
    );
    setStorageError(null);
  } catch (error) {
    setStorageError(readErrorMessage(error));
  } finally {
    setStorageBusy(false);
  }
}

function createSchemeControllerView(
  c: SchemeControllerContext,
  y: ReturnType<typeof useConditionalBatchYamlExchange>,
  favorites: ReturnType<typeof useConditionalBatchSchemeFavorites>,
  changeDraft: (draft: ConditionalBatchSchemeDraftV2) => void,
) {
  return {
    applyNotice: c.applyNotice,
    autosaveState: c.autosaveState,
    blockStylePresets: c.options.blockStylePresets ?? [],
    canDeleteScheme: !CONDITIONAL_BATCH_STARTER_SCHEME_IDS.includes(
      c.selectedSchemeId as (typeof CONDITIONAL_BATCH_STARTER_SCHEME_IDS)[number],
    ),
    changeDraft,
    chooseRecipe: (
      recipe: ConditionalBatchRecipeId,
      preset?: BlockStylePreset,
    ) => void c.runWithSavedDraft(() => resetToRecipe(c, recipe, preset)),
    createNewScheme: () => {
      c.setRecipePickerOpen(true);
      c.setRecipePickerCanClose(true);
      c.setStorageError(null);
      c.setApplyNotice(null);
    },
    deleteScheme: () => void deleteScheme(c),
    deleteSequence: (id: string) => void deleteSequence(c, id),
    draft: c.draft,
    duplicateScheme: () => void c.runWithSavedDraft(() => duplicateScheme(c)),
    exportYaml: (all: boolean) => void y.exportYaml(all),
    favoriteSchemeIds: favorites.favoriteSchemeIds,
    importYaml: (policy?: "duplicate" | "overwrite") =>
      void y.importYaml(policy),
    openYamlEditor: () => void y.openYamlEditor(),
    openYamlFile: () => void y.openYamlFile(),
    parsedDraft: c.parsedDraft,
    runWithSavedDraft: c.runWithSavedDraft,
    recipePickerOpen: c.recipePickerOpen,
    recipePickerCanClose: c.recipePickerCanClose,
    reflectYamlInDraft: y.reflectYamlInDraft,
    savedSchemes: c.snapshot?.schemes ?? [],
    saveScheme: () => void c.saveScheme(),
    saveSequence: (sequence: ConditionalBatchSequenceV2) =>
      saveSequence(c, sequence),
    selectedSchemeId: c.selectedSchemeId,
    selectScheme: (id: string) =>
      void c.runWithSavedDraft(() => selectScheme(c, id)),
    sequences: c.snapshot?.sequences ?? [],
    snapshot: c.snapshot ?? createEmptyConditionalBatchSnapshot(),
    setApplyNotice: c.setApplyNotice,
    setRecipePickerOpen: c.setRecipePickerOpen,
    setYamlOpen: y.setYamlOpen,
    setYamlText: y.setYamlText,
    storageBusy: c.storageBusy,
    storageError: c.storageError,
    temporarySchemes: c.temporaryDrafts.map((session) => ({
      id: session.id,
      name: session.draft.name,
      dirty: stableDraftString(session.draft) !== session.baseline,
    })),
    toggleSchemeFavorite: favorites.toggleSchemeFavorite,
    hasDirtyTemporaryDrafts: c.temporaryDrafts.some(
      (session) => stableDraftString(session.draft) !== session.baseline,
    ),
    validationMessage: c.parsedDraft.success
      ? null
      : formatConditionalBatchValidationIssue(c.parsedDraft.error.issues[0]),
    yamlError: y.yamlError,
    yamlOpen: y.yamlOpen,
    yamlText: y.yamlText,
  };
}

function useDraftChange(
  session: ReturnType<typeof useSchemeDraftSession>,
  persistence: ReturnType<typeof useConditionalBatchSchemePersistence>,
  yaml: ReturnType<typeof useConditionalBatchYamlExchange>,
) {
  const { selectedSchemeId, setDraft, setTemporaryDrafts, setApplyNotice } =
    session;
  const { invalidateSave } = persistence;
  const { setYamlError } = yaml;
  const changeDraft = React.useCallback(
    (next: ConditionalBatchSchemeDraftV2): void => {
      invalidateSave();
      setDraft(next);
      setTemporaryDrafts((current) =>
        current.map((entry) =>
          entry.id === selectedSchemeId ? { ...entry, draft: next } : entry,
        ),
      );
      setApplyNotice(null);
      setYamlError(null);
    },
    [
      selectedSchemeId,
      setDraft,
      setTemporaryDrafts,
      setApplyNotice,
      invalidateSave,
      setYamlError,
    ],
  );
  return changeDraft;
}
