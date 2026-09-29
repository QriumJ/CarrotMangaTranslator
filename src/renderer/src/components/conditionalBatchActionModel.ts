import type { BlockStylePreset } from "../../../shared/blockStylePresets";

import {
  createConditionalBatchClientId,
  MAX_CONDITIONAL_BATCH_ACTIONS,
  type ConditionalBatchActionV2,
  type ConditionalBatchApplyStylePresetActionV2,
  type ConditionalBatchPreviewResult,
  type ConditionalBatchSchemeDraftV2,
  type ConditionalBatchSetFieldsActionV2,
} from "../../../shared/conditionalBatchRules";

import { stripRichTextMarkup } from "../../../shared/richTextMarkup";

import {
  actionStage,
  createDefaultAction,
} from "./conditionalBatchDraftDefaults";

type ActionDraftEditor = {
  draft: ConditionalBatchSchemeDraftV2;
  onChangeDraft: (draft: ConditionalBatchSchemeDraftV2) => void;
};

export function createActionActions(
  { draft, onChangeDraft }: ActionDraftEditor,
  setActiveId: (id: string | null) => void,
) {
  const commit = (actions: ConditionalBatchActionV2[]): void =>
    onChangeDraft({ ...draft, actions: normalizeActionOrder(actions) });
  const addAction = (
    type: "replaceText" | "setFields" | "setText" | "styleText",
  ): void => {
    const action =
      type === "setText"
        ? ({
            id: createConditionalBatchClientId("action"),
            enabled: true,
            type: "setFields",
            changes: [
              {
                field: "translatedText",
                operation: "set",
                value: "",
              },
            ],
          } satisfies ConditionalBatchSetFieldsActionV2)
        : createDefaultAction(type);
    commit([...draft.actions, action]);
    setActiveId(action.id);
  };
  const addPresetAction = (preset: BlockStylePreset): void => {
    const action = createPresetAction(preset);
    commit([...draft.actions, action]);
    setActiveId(action.id);
  };
  const updateAction = (id: string, next: ConditionalBatchActionV2): void =>
    commit(
      draft.actions.map((action) =>
        action.id === id ? { ...next, id } : action,
      ),
    );
  const removeAction = (id: string): void => {
    commit(draft.actions.filter((action) => action.id !== id));
    setActiveId(null);
  };
  const duplicateAction = (id: string): void => {
    if (draft.actions.length >= MAX_CONDITIONAL_BATCH_ACTIONS) return;
    const source = draft.actions.find((action) => action.id === id);
    if (!source) return;
    const duplicate = {
      ...structuredClone(source),
      id: createConditionalBatchClientId("action"),
    };
    const index = draft.actions.indexOf(source);
    const next = [...draft.actions];
    next.splice(index + 1, 0, duplicate);
    commit(next);
    setActiveId(duplicate.id);
  };
  const { moveAction, dropAction } = createActionOrderingActions(draft, commit);

  return {
    addAction,
    addPresetAction,
    dropAction,
    duplicateAction,
    moveAction,
    removeAction,
    updateAction,
  };
}

function normalizeActionOrder(
  actions: readonly ConditionalBatchActionV2[],
): ConditionalBatchActionV2[] {
  return [1, 2, 3].flatMap((stage) =>
    actions.filter((action) => actionStage(action) === stage),
  );
}

export function createPresetAction(
  preset: BlockStylePreset,
  id = createConditionalBatchClientId("action"),
): ConditionalBatchApplyStylePresetActionV2 {
  return {
    id,
    enabled: true,
    type: "applyStylePreset",
    presetId: preset.id,
    presetName: preset.name,
    groupIds: [...preset.groupIds],
    format: structuredClone(preset.format),
  };
}

export function updatePatch<T extends object, K extends keyof T>(
  patch: T,
  key: K,
  value: T[K] | undefined,
): T {
  const next = { ...patch };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

export function readActionSample(
  action: ConditionalBatchActionV2,
  result: ConditionalBatchPreviewResult | null,
): string | undefined {
  if (!result) return undefined;
  if (action.type === "replaceText" && action.target === "sourceText") {
    return result.beforeBlock.sourceText;
  }
  if (action.type === "replaceText" || action.type === "styleText") {
    return stripRichTextMarkup(result.beforeBlock.translatedText);
  }
  return undefined;
}

function createActionOrderingActions(
  draft: ConditionalBatchSchemeDraftV2,
  commit: (actions: ConditionalBatchActionV2[]) => void,
) {
  const moveAction = (id: string, offset: -1 | 1): void => {
    const current = draft.actions.find((action) => action.id === id);
    if (!current) return;
    const stageActions = draft.actions.filter(
      (action) => actionStage(action) === actionStage(current),
    );
    const stageIndex = stageActions.findIndex((action) => action.id === id);
    const target = stageActions[stageIndex + offset];
    if (!target) return;
    dropAction(id, target.id);
  };
  const dropAction = (sourceId: string, targetId: string): void => {
    const source = draft.actions.find((action) => action.id === sourceId);
    const target = draft.actions.find((action) => action.id === targetId);
    if (!source || !target || actionStage(source) !== actionStage(target)) {
      return;
    }
    const next = draft.actions.filter((action) => action.id !== sourceId);
    const targetIndex = next.findIndex((action) => action.id === targetId);
    const sourceIndex = draft.actions.findIndex(
      (action) => action.id === sourceId,
    );
    const originalTargetIndex = draft.actions.findIndex(
      (action) => action.id === targetId,
    );
    const insertAt =
      sourceIndex < originalTargetIndex ? targetIndex + 1 : targetIndex;
    next.splice(insertAt, 0, source);
    commit(next);
  };
  return { moveAction, dropAction };
}
