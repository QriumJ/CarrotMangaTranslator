import React from "react";
import { type ConditionalBatchSequenceV2 } from "../../../shared/conditionalBatchRules";
import {
  ConditionalBatchEditorModel,
  ConditionalBatchEditorModelProps,
} from "./conditionalBatchEditorTypes";
import type { ConditionalBatchResultsCardProps } from "./ConditionalBatchResultsCard";
import type { ConditionalBatchRulePanelProps } from "./conditionalBatchRulePanelTypes";
import { createConditionalBatchSpeakerCatalog } from "./conditionalBatchSpeakers";
import { useApplicationController } from "./useConditionalBatchApplication";
import { usePreviewController } from "./useConditionalBatchPreview";
import { useConditionalBatchSchemeController } from "./useConditionalBatchSchemeController";
type EditorViewArgs = {
  props: ConditionalBatchEditorModelProps;
  scheme: ReturnType<typeof useConditionalBatchSchemeController>;
  preview: ReturnType<typeof usePreviewController>;
  application: ReturnType<typeof useApplicationController>;
  speakers: ReturnType<typeof createConditionalBatchSpeakerCatalog>;
  activeSequence: ConditionalBatchSequenceV2 | null;
  setActiveSequenceId: React.Dispatch<React.SetStateAction<string | null>>;
  busy: boolean;
  validationMessage: string | null;
};
export function createConditionalBatchEditorView(
  args: EditorViewArgs,
): ConditionalBatchEditorModel {
  const {
    props,
    scheme,
    preview,
    application,
    activeSequence,
    busy,
    validationMessage,
  } = args;
  const sharedResultsProps: ConditionalBatchResultsCardProps = {
    currentResult: preview.currentResult,
    currentResultIndex: preview.currentResultIndex,
    excludedResultKeys: preview.excludedResultKeys,
    preview: preview.preview,
    onMoveResult: preview.moveResult,
    onSelectResult: preview.activateResult,
    onSetAllResultsIncluded: preview.setAllResultsIncluded,
    onToggleResult: preview.toggleResult,
  };
  return {
    close: () => void scheme.runWithSavedDraft(props.onClose),
    hasDirtyTemporaryDrafts: scheme.hasDirtyTemporaryDrafts,
    previewPaneProps: {
      currentResultIndex: preview.currentResultIndex,
      pageName: preview.selectedPageName,
      previewMode: preview.previewMode,
      resultCount: preview.preview.results.length,
      workspaceProps: preview.previewWorkspaceProps,
      onChangePreviewMode: preview.setPreviewMode,
      onMoveResult: preview.moveResult,
    },
    resultsProps: sharedResultsProps,
    rulePanelProps: createRulePanelView(args),
    footerProps: {
      applyNotice: scheme.applyNotice,
      busy,
      canUndo: props.canUndo,
      conflictCount: application.conflictCount,
      excludedCount: preview.excludedResultKeys.size,
      includedCount: preview.includedCount,
      inspectionOnly: preview.preview.inspectionOnly,
      sequenceName: activeSequence?.name ?? null,
      undoLabel: props.undoLabel,
      validationMessage,
      onApply: application.apply,
      onUndo: application.undo,
    },
  };
}
function createRulePanelView({
  props,
  scheme,
  preview,
  speakers,
  activeSequence,
  setActiveSequenceId,
  validationMessage,
}: EditorViewArgs): ConditionalBatchRulePanelProps {
  return {
    speakers,
    applyNotice: scheme.applyNotice,
    activeSequence,
    sequencePreview: preview.sequencePreview,
    autosaveState: scheme.autosaveState,
    blockStylePresets: scheme.blockStylePresets,
    canDeleteScheme: scheme.canDeleteScheme,
    currentResult: preview.currentResult,
    draft: scheme.draft,
    favoriteSchemeIds: scheme.favoriteSchemeIds,
    recipePickerCanClose: scheme.recipePickerCanClose,
    recipePickerOpen: scheme.recipePickerOpen,
    savedSchemes: scheme.savedSchemes,
    scopeKind: preview.scopeKind,
    selectedBlockCount: props.selectedBlockIds?.length ?? 0,
    selectedSchemeId: scheme.selectedSchemeId,
    sequences: scheme.sequences,
    storageBusy: scheme.storageBusy,
    storageError: scheme.storageError,
    temporarySchemes: scheme.temporarySchemes,
    validationMessage,
    yamlError: scheme.yamlError,
    yamlOpen: scheme.yamlOpen,
    yamlText: scheme.yamlText,
    onChangeDraft: (draft) => {
      setActiveSequenceId(null);
      scheme.changeDraft(draft);
    },
    onChangeScope: preview.changeScope,
    onChooseRecipe: scheme.chooseRecipe,
    onCloseRecipePicker: () => scheme.setRecipePickerOpen(false),
    onDeleteScheme: scheme.deleteScheme,
    onDeleteSequence: scheme.deleteSequence,
    onDuplicateScheme: scheme.duplicateScheme,
    onExportYaml: scheme.exportYaml,
    onImportYaml: scheme.importYaml,
    onNewScheme: scheme.createNewScheme,
    onOpenYaml: scheme.openYamlEditor,
    onOpenYamlFile: scheme.openYamlFile,
    onReflectYaml: scheme.reflectYamlInDraft,
    onSaveScheme: scheme.saveScheme,
    onSaveSequence: scheme.saveSequence,
    onPreviewSequence: (id) =>
      void scheme.runWithSavedDraft(() => setActiveSequenceId(id)),
    onExitSequence: () => setActiveSequenceId(null),
    onSelectScheme: scheme.selectScheme,
    onSetYamlOpen: scheme.setYamlOpen,
    onSetYamlText: scheme.setYamlText,
    onToggleSchemeFavorite: scheme.toggleSchemeFavorite,
  };
}
