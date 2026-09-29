import type {
  ConditionalBatchField,
  ConditionalBatchOperator,
} from "../../../shared/conditionalBatchFieldRegistry";

import {
  MAX_CONDITIONAL_BATCH_CONDITIONS,
  createConditionalBatchClientId,
  type ConditionalBatchConditionGroupV2,
  type ConditionalBatchConditionV2,
  type ConditionalBatchSchemeDraftV2,
} from "../../../shared/conditionalBatchRules";

import { createConditionForField } from "./conditionalBatchDraftDefaults";
import { listConditionalBatchFields } from "./conditionalBatchUi";

type ConditionDraftEditor = {
  draft: ConditionalBatchSchemeDraftV2;
  ruleId: string;
  onChangeDraft: (draft: ConditionalBatchSchemeDraftV2) => void;
};

export type ConditionalMatchMemory = Pick<
  ConditionalBatchSchemeDraftV2["match"],
  "conditions" | "groups"
>;

export function createConditionActions(
  { draft, onChangeDraft, ruleId }: ConditionDraftEditor,
  setActiveId: (id: string | null) => void,
  conditionMemory: ReadonlyMap<string, ConditionalMatchMemory>,
  rememberConditions: (ruleId: string, memory: ConditionalMatchMemory) => void,
) {
  const commitMatch = (match: ConditionalBatchSchemeDraftV2["match"]): void =>
    onChangeDraft({ ...draft, match });
  const changeMode = createConditionModeAction(
    draft,
    commitMatch,
    ruleId,
    conditionMemory,
    rememberConditions,
  );

  const addCondition = createConditionAdditionAction(
    draft,
    commitMatch,
    setActiveId,
  );

  const updateCondition = (
    id: string,
    next: ConditionalBatchConditionV2,
  ): void =>
    commitMatch({
      ...draft.match,
      conditions: draft.match.conditions.map((condition) =>
        condition.id === id ? { ...next, id } : condition,
      ),
    });
  const removeCondition = (id: string): void =>
    commitMatch({
      ...draft.match,
      conditions: draft.match.conditions.filter(
        (condition) => condition.id !== id,
      ),
    });
  const duplicateCondition = (id: string): void => {
    const source = draft.match.conditions.find(
      (condition) => condition.id === id,
    );
    if (!source || countConditions(draft) >= MAX_CONDITIONAL_BATCH_CONDITIONS) {
      return;
    }
    const duplicate = {
      ...source,
      id: createConditionalBatchClientId("condition"),
    };
    const index = draft.match.conditions.indexOf(source);
    const conditions = [...draft.match.conditions];
    conditions.splice(index + 1, 0, duplicate);
    commitMatch({ ...draft.match, conditions });
    setActiveId(duplicate.id);
  };
  const moveCondition = (id: string, offset: -1 | 1): void => {
    const index = draft.match.conditions.findIndex(
      (condition) => condition.id === id,
    );
    commitMatch({
      ...draft.match,
      conditions: moveArrayItem(draft.match.conditions, index, index + offset),
    });
  };
  const { addGroup, updateGroup, removeGroup } = createConditionGroupActions(
    draft,
    commitMatch,
    setActiveId,
  );

  return {
    addCondition,
    addGroup,
    changeMode,
    duplicateCondition,
    moveCondition,
    removeCondition,
    removeGroup,
    updateCondition,
    updateGroup,
  };
}

export function conditionOperators(
  condition: ConditionalBatchConditionV2,
): readonly ConditionalBatchOperator[] {
  const definition = listConditionalBatchFields().find(
    (field) => field.id === condition.field,
  );
  if (!definition) return [];
  if (condition.field !== "fontFamily" && condition.field !== "speakerId")
    return definition.operators;
  const preferred: readonly ConditionalBatchOperator[] = [
    "equals",
    "notEquals",
    "empty",
    "notEmpty",
  ];
  return preferred.includes(condition.operator)
    ? preferred
    : [...preferred, condition.operator];
}

export function moveArrayItem<T>(
  values: readonly T[],
  from: number,
  to: number,
): T[] {
  if (from < 0 || to < 0 || to >= values.length) return [...values];
  const next = [...values];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

export function countConditions(draft: ConditionalBatchSchemeDraftV2): number {
  return (
    draft.match.conditions.length +
    draft.match.groups.reduce(
      (count, group) => count + group.conditions.length,
      0,
    )
  );
}

function createConditionModeAction(
  draft: ConditionalBatchSchemeDraftV2,
  commitMatch: (match: ConditionalBatchSchemeDraftV2["match"]) => void,
  ruleId: string,
  conditionMemory: ReadonlyMap<string, ConditionalMatchMemory>,
  rememberConditions: (ruleId: string, memory: ConditionalMatchMemory) => void,
) {
  const changeMode = (
    mode: ConditionalBatchSchemeDraftV2["match"]["mode"],
  ): void => {
    if (mode === "allBlocks") {
      if (draft.match.mode !== "allBlocks") {
        rememberConditions(ruleId, {
          conditions: draft.match.conditions,
          groups: draft.match.groups,
        });
      }
      commitMatch({ mode, conditions: [], groups: [] });
      return;
    }
    const source =
      draft.match.mode === "allBlocks"
        ? conditionMemory.get(ruleId)
        : draft.match;
    const conditions =
      source && (source.conditions.length || source.groups.length)
        ? source.conditions
        : [createConditionForField("translatedText")];
    commitMatch({
      mode,
      conditions,
      groups: source?.groups ?? [],
    });
  };
  return changeMode;
}
function createConditionGroupActions(
  draft: ConditionalBatchSchemeDraftV2,
  commitMatch: (match: ConditionalBatchSchemeDraftV2["match"]) => void,
  setActiveId: (id: string | null) => void,
) {
  const addGroup = (): void => {
    if (countConditions(draft) >= MAX_CONDITIONAL_BATCH_CONDITIONS) return;
    const condition = createConditionForField("translatedText");
    const group: ConditionalBatchConditionGroupV2 = {
      id: createConditionalBatchClientId("group"),
      enabled: true,
      logic: "all",
      conditions: [condition],
    };
    commitMatch({ ...draft.match, groups: [...draft.match.groups, group] });
    setActiveId(condition.id);
  };
  const updateGroup = (
    id: string,
    next: ConditionalBatchConditionGroupV2,
  ): void =>
    commitMatch({
      ...draft.match,
      groups: draft.match.groups.map((group) =>
        group.id === id ? { ...next, id } : group,
      ),
    });
  const removeGroup = (id: string): void =>
    commitMatch({
      ...draft.match,
      groups: draft.match.groups.filter((group) => group.id !== id),
    });
  return { addGroup, updateGroup, removeGroup };
}

function createConditionAdditionAction(
  draft: ConditionalBatchSchemeDraftV2,
  commitMatch: (match: ConditionalBatchSchemeDraftV2["match"]) => void,
  setActiveId: (id: string | null) => void,
) {
  const addCondition = (
    field: ConditionalBatchField,
    groupId?: string,
  ): void => {
    if (countConditions(draft) >= MAX_CONDITIONAL_BATCH_CONDITIONS) return;
    const condition = createConditionForField(field);
    if (groupId) {
      commitMatch({
        ...draft.match,
        groups: draft.match.groups.map((group) =>
          group.id === groupId
            ? { ...group, conditions: [...group.conditions, condition] }
            : group,
        ),
      });
    } else {
      commitMatch({
        ...draft.match,
        conditions: [...draft.match.conditions, condition],
      });
    }
    setActiveId(condition.id);
  };
  return addCondition;
}
