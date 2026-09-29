import {
  formatConditionalBatchFieldValue,
  getConditionalBatchFieldDefinition,
  type ConditionalBatchField,
} from "../../../shared/conditionalBatchFieldRegistry";

import {
  type ConditionalBatchActionV2,
  type ConditionalBatchConditionV2,
  type ConditionalBatchSetFieldChangeV2,
} from "../../../shared/conditionalBatchRules";

import {
  type ConditionalReplacementV3,
  type ConditionalTextMatcherV3,
} from "../../../shared/conditionalTextPattern";

import {
  CONDITIONAL_BATCH_FIELD_LABELS,
  CONDITIONAL_BATCH_OPERATOR_LABELS,
  conditionalBatchEnumOptions,
} from "./conditionalBatchUi";

export function summarizeCondition(
  condition: ConditionalBatchConditionV2,
  displayValue?: string,
): string {
  const field = CONDITIONAL_BATCH_FIELD_LABELS[condition.field];
  const operator = CONDITIONAL_BATCH_OPERATOR_LABELS[condition.operator];
  const value =
    condition.operator === "regex" || condition.operator === "notRegex"
      ? summarizeTextMatcher(condition.matcher)
      : (displayValue ??
        (condition.value === undefined
          ? ""
          : formatConditionalBatchDisplayValue(
              condition.field,
              condition.value,
            )));
  const end =
    condition.operator === "between"
      ? ` ${value}–${condition.value2 === undefined ? "" : formatConditionalBatchDisplayValue(condition.field, condition.value2)}`
      : value
        ? ` “${value}”`
        : "";
  return `${field}이(가) ${operator}${end}`;
}

export function summarizeAction(action: ConditionalBatchActionV2): string {
  if (action.type === "replaceText") {
    return `${summarizeTextMatcher(action.matcher)}을(를) ${summarizeReplacement(action.replacement)}(으)로 ${
      action.allOccurrences ? "모두" : "첫 번째만"
    } 바꾸기`;
  }
  if (action.type === "applyStylePreset") {
    return `${action.presetName} 프리셋 적용`;
  }
  if (action.type === "setFields") {
    return action.changes.map(summarizeSetFieldChange).join(" · ");
  }
  const target =
    action.scope === "allText"
      ? "전체 글자"
      : summarizeTextMatcher(action.matcher);
  return `${target}에 부분 서식 적용`;
}

function summarizeSetFieldChange(
  change: ConditionalBatchSetFieldChangeV2,
): string {
  const label = CONDITIONAL_BATCH_FIELD_LABELS[change.field];
  if (change.operation === "clear") return `${label} 지정 해제`;
  const definition = getConditionalBatchFieldDefinition(change.field);
  if (definition.kind === "boolean") {
    return summarizeBooleanSetField(label, change.value);
  }
  if (definition.kind === "enum") {
    return summarizeEnumSetField(label, change);
  }
  if (definition.kind === "number") {
    return `${label} ${formatConditionalBatchDisplayValue(change.field, change.value)}`;
  }
  const value = String(change.value ?? "");
  return `${label} ${value || "빈 값"}`;
}

function summarizeBooleanSetField(
  label: string,
  value: ConditionalBatchSetFieldChangeV2["value"],
): string {
  return `${label} ${value === true ? "켜기" : "끄기"}`;
}

function summarizeEnumSetField(
  label: string,
  change: ConditionalBatchSetFieldChangeV2,
): string {
  const rawValue = String(change.value ?? "");
  const option = conditionalBatchEnumOptions(change.field).find(
    (entry) => entry.value === rawValue,
  );
  return `${label} ${option?.label ?? rawValue}`;
}

export function resolveConditionalBatchNumberPresentation(
  field: ConditionalBatchField,
  value: number,
) {
  const number = getConditionalBatchFieldDefinition(field).number;
  const scale = PERCENT_VALUE_FIELDS.has(field) ? 100 : 1;
  return {
    value: cleanNumber(value * scale),
    min: number ? cleanNumber(number.min * scale) : Number.MIN_SAFE_INTEGER,
    max: number ? cleanNumber(number.max * scale) : Number.MAX_SAFE_INTEGER,
    step: number ? cleanNumber(number.step * scale) : 0.01,
    unit:
      scale === 100
        ? "%"
        : (number?.unit ??
          (field === "lineHeight" || field === "outlineWidthScale" ? "×" : "")),
    toStoredValue: (next: number) => cleanNumber(next / scale),
  };
}

export function formatConditionalBatchDisplayValue(
  field: ConditionalBatchField,
  value: unknown,
): string {
  if (typeof value === "number") {
    const presentation = resolveConditionalBatchNumberPresentation(
      field,
      value,
    );
    return `${presentation.value}${presentation.unit}`;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => formatConditionalBatchDisplayValue(field, item))
      .join(", ");
  }
  return (
    conditionalBatchEnumOptions(field).find((option) => option.value === value)
      ?.label ??
    formatConditionalBatchFieldValue(
      typeof value === "string" || typeof value === "boolean"
        ? value
        : undefined,
    )
  );
}

function cleanNumber(value: number): number {
  return Number(value.toFixed(6));
}

const PERCENT_VALUE_FIELDS = new Set<ConditionalBatchField>([
  "fontWidthScale",
  "textOpacity",
  "textEffectOpacity",
  "textGlowOpacity",
  "confidence",
  "fontRoleConfidence",
]);

function summarizeTextMatcher(
  matcher: ConditionalTextMatcherV3 | undefined,
): string {
  if (!matcher) return "패턴";
  if (matcher.mode === "regex") return "고급 패턴";
  if (matcher.nodes.length === 1 && matcher.nodes[0]?.kind === "literal") {
    return `“${matcher.nodes[0].text}”`;
  }
  return matcher.nodes
    .map((node) => {
      if (node.kind === "literal") return `“${node.text}”`;
      if (node.kind === "character") {
        return {
          number: "숫자",
          letter: "글자",
          whitespace: "공백",
          newline: "줄바꿈",
          any: "아무 글자",
        }[node.character];
      }
      if (node.kind === "choice") return node.options.join(" 또는 ");
      if (node.kind === "group") return "묶음";
      return node.boundary === "start" ? "말풍선 처음" : "말풍선 끝";
    })
    .join(" + ");
}

function summarizeReplacement(replacement: ConditionalReplacementV3): string {
  if (replacement.mode === "raw") return "고급 치환";
  if (replacement.parts.length === 0) return "빈 글자";
  return replacement.parts
    .map((part) => (part.kind === "literal" ? `“${part.text}”` : "기억한 부분"))
    .join(" + ");
}
