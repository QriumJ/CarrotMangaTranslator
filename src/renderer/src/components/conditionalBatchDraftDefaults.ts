import {
  getConditionalBatchFieldDefinition,
  type ConditionalBatchField,
  type ConditionalBatchOperator,
} from "../../../shared/conditionalBatchFieldRegistry";

import {
  createConditionalBatchClientId,
  type ConditionalBatchActionV2,
  type ConditionalBatchConditionV2,
} from "../../../shared/conditionalBatchRules";

import {
  createConditionalLiteralMatcher,
  createConditionalLiteralReplacement,
} from "../../../shared/conditionalTextPattern";

import { DEFAULT_BLOCK_FONT_ID } from "../../../shared/blockFontCatalog";

import { conditionalBatchEnumOptions } from "./conditionalBatchUi";

export function createConditionForField(
  field: ConditionalBatchField,
): ConditionalBatchConditionV2 {
  const definition = getConditionalBatchFieldDefinition(field);
  const base = {
    id: createConditionalBatchClientId("condition"),
    enabled: true,
    field,
  };
  if (definition.kind === "boolean") {
    return { ...base, operator: "isTrue" };
  }
  if (definition.kind === "number") {
    return {
      ...base,
      operator: "equals",
      value: definition.number?.defaultValue ?? 0,
    };
  }
  if (definition.kind === "color") {
    return { ...base, operator: "equals", value: "#000000" };
  }
  if (definition.kind === "enum") {
    return {
      ...base,
      operator: "equals",
      value: conditionalBatchEnumOptions(field)[0]?.value ?? "",
    };
  }
  if (field === "fontFamily") {
    return { ...base, operator: "equals", value: DEFAULT_BLOCK_FONT_ID };
  }
  if (field === "speakerId") {
    return { ...base, operator: "equals", value: "" };
  }
  return { ...base, operator: "contains", value: "" };
}

export function conditionValueForOperator(
  condition: ConditionalBatchConditionV2,
  operator: ConditionalBatchOperator,
): ConditionalBatchConditionV2 {
  const definition = getConditionalBatchFieldDefinition(condition.field);
  const base = { ...condition, operator };
  if (isValuelessOperator(operator)) return removeConditionValues(base);
  if (operator === "regex" || operator === "notRegex") {
    return conditionWithMatcher(condition, base);
  }
  if (operator === "oneOf" || operator === "notOneOf") {
    return setConditionValue(condition, base);
  }
  if (definition.kind === "number") {
    return numericConditionValue(condition, base, operator, definition);
  }
  if (definition.kind === "color") {
    return {
      ...base,
      value: typeof condition.value === "string" ? condition.value : "#000000",
      ...(operator === "near" ? { tolerance: condition.tolerance ?? 10 } : {}),
    };
  }
  return {
    ...base,
    matcher: undefined,
    value: typeof condition.value === "string" ? condition.value : "",
  };
}

function isValuelessOperator(operator: ConditionalBatchOperator): boolean {
  return ["empty", "notEmpty", "isTrue", "isFalse"].includes(operator);
}

function removeConditionValues(
  condition: ConditionalBatchConditionV2,
): ConditionalBatchConditionV2 {
  const {
    value: _value,
    value2: _value2,
    tolerance: _tolerance,
    matcher: _matcher,
    ...rest
  } = condition;
  return rest;
}

function conditionWithMatcher(
  condition: ConditionalBatchConditionV2,
  base: ConditionalBatchConditionV2,
): ConditionalBatchConditionV2 {
  const {
    value: _value,
    value2: _value2,
    tolerance: _tolerance,
    ...rest
  } = base;
  return {
    ...rest,
    matcher:
      condition.matcher ??
      createConditionalLiteralMatcher(
        typeof condition.value === "string" ? condition.value : "",
      ),
  };
}

export function actionStage(action: ConditionalBatchActionV2): 1 | 2 | 3 {
  if (action.type === "replaceText") return 2;
  if (action.type === "styleText") return 3;
  return 1;
}

export function createDefaultAction(
  type: ConditionalBatchActionV2["type"],
): ConditionalBatchActionV2 {
  if (type === "replaceText") {
    return {
      id: createConditionalBatchClientId("action"),
      enabled: true,
      type,
      target: "translatedText",
      matcher: createConditionalLiteralMatcher(""),
      replacement: createConditionalLiteralReplacement(""),
      allOccurrences: true,
    };
  }
  if (type === "setFields") {
    return {
      id: createConditionalBatchClientId("action"),
      enabled: true,
      type,
      changes: [
        { field: "reviewStatus", operation: "set", value: "needs_review" },
      ],
    };
  }
  if (type === "styleText") {
    return {
      id: createConditionalBatchClientId("action"),
      enabled: true,
      type,
      target: "translatedText",
      scope: "allText",
      allOccurrences: true,
      styleMode: "overwrite",
      patch: { bold: true },
    };
  }
  throw new Error("적용할 스타일 프리셋을 먼저 선택하세요.");
}

function numericConditionValue(
  condition: ConditionalBatchConditionV2,
  base: ConditionalBatchConditionV2,
  operator: ConditionalBatchOperator,
  definition: ReturnType<typeof getConditionalBatchFieldDefinition>,
): ConditionalBatchConditionV2 {
  const defaultValue = definition.number?.defaultValue ?? 0;
  return {
    ...base,
    value: typeof condition.value === "number" ? condition.value : defaultValue,
    ...(operator === "between"
      ? {
          value2:
            typeof condition.value2 === "number"
              ? condition.value2
              : definition.number
                ? Math.min(
                    definition.number.max,
                    defaultValue + definition.number.step,
                  )
                : 1,
        }
      : {}),
  };
}

function setConditionValue(
  condition: ConditionalBatchConditionV2,
  base: ConditionalBatchConditionV2,
): ConditionalBatchConditionV2 {
  return {
    ...base,
    value: Array.isArray(condition.value)
      ? condition.value
      : [
          String(
            condition.value ??
              conditionalBatchEnumOptions(condition.field)[0]?.value ??
              "",
          ),
        ],
  };
}
