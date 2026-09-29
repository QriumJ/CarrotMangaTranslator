import { IconPlus, IconTrash } from "@tabler/icons-react";

import { DEFAULT_BLOCK_FONT_ID } from "../../../shared/blockFontCatalog";

import {
  CONDITIONAL_BATCH_TEXT_STYLE_FIELDS,
  createConditionalBatchClientId,
  type ConditionalBatchActionV2,
  type ConditionalBatchStyleTextActionV2,
  type ConditionalBatchTextStyleField,
  type ConditionalBatchTextStyleMatchCondition,
  type ConditionalBatchTextStyleOperator,
  type ConditionalBatchWritableField,
} from "../../../shared/conditionalBatchRules";

import { resolveConditionalBatchNumberPresentation } from "./conditionalBatchPresentation";

import { Button } from "./ui/Button";
import { CheckboxField } from "./ui/CheckboxField";
import { Select } from "./ui/Select";

import { FontSelect } from "./FontSelect";

import { ColorField } from "./ColorField";

import { IconButton } from "./ui/IconButton";

import { NumberField } from "./ui/NumberField";

import { SegmentedControl } from "./ui/SegmentedControl";

import styles from "./ConditionalBatchEditor.module.css";

const TEXT_STYLE_FIELD_LABELS: Record<ConditionalBatchTextStyleField, string> =
  {
    bold: "굵게",
    italic: "기울임",
    underline: "밑줄",
    strikethrough: "취소선",
    emphasisMark: "강조점",
    fontFamily: "글꼴",
    sizePx: "크기",
    opacity: "글자 투명도",
    widthScale: "장평",
    color: "글자색",
    backgroundColor: "글자 배경색",
    outlineColor: "외곽선색",
    outlineWidthPx: "외곽선 두께",
    outerOutlineColor: "바깥 외곽선색",
    outerOutlineWidthPx: "바깥 외곽선 두께",
    glowColor: "광선색",
    glowBlurPx: "광선 퍼짐",
    glowOpacity: "광선 불투명도",
  };

export function ExistingStyleMatchEditor({
  action,
  onChange,
}: {
  action: ConditionalBatchStyleTextActionV2;
  onChange: (action: ConditionalBatchActionV2) => void;
}) {
  const matchStyle = action.matchStyle;
  const usedFields = new Set(
    matchStyle?.conditions.map((condition) => condition.field) ?? [],
  );
  const availableFields = CONDITIONAL_BATCH_TEXT_STYLE_FIELDS.filter(
    (field) => !usedFields.has(field),
  );
  const updateMatch = (
    conditions: ConditionalBatchTextStyleMatchCondition[],
  ): void => {
    onChange({
      ...action,
      matchStyle: {
        logic: matchStyle?.logic ?? "all",
        conditions,
      },
    });
  };
  return (
    <div className={styles.existingStyleMatch}>
      <StyleMatchActivationControls
        action={action}
        matchStyle={matchStyle}
        onChange={onChange}
      />
      {matchStyle ? (
        <div className={styles.existingStyleConditions}>
          {matchStyle.conditions.map((condition, index) => (
            <TextStyleMatchConditionEditor
              key={condition.id}
              condition={condition}
              disabledFields={usedFields}
              onChange={(next) =>
                updateMatch(
                  matchStyle.conditions.map((entry, entryIndex) =>
                    entryIndex === index ? next : entry,
                  ),
                )
              }
              onDelete={() =>
                matchStyle.conditions.length === 1
                  ? onChange({ ...action, matchStyle: undefined })
                  : updateMatch(
                      matchStyle.conditions.filter(
                        (_entry, entryIndex) => entryIndex !== index,
                      ),
                    )
              }
            />
          ))}
          {availableFields.length ? (
            <Button
              size="sm"
              variant="ghost"
              iconLeft={<IconPlus size={14} />}
              onClick={() =>
                updateMatch([
                  ...matchStyle.conditions,
                  createTextStyleMatchCondition(availableFields[0] ?? "bold"),
                ])
              }
            >
              서식 조건 추가
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TextStyleMatchConditionEditor({
  condition,
  disabledFields,
  onChange,
  onDelete,
}: {
  condition: ConditionalBatchTextStyleMatchCondition;
  disabledFields: ReadonlySet<ConditionalBatchTextStyleField>;
  onChange: (condition: ConditionalBatchTextStyleMatchCondition) => void;
  onDelete: () => void;
}) {
  const operators = textStyleOperatorOptions(condition.field);
  return (
    <div className={styles.existingStyleConditionRow}>
      <Select
        ariaLabel="기존 부분 서식"
        value={condition.field}
        options={CONDITIONAL_BATCH_TEXT_STYLE_FIELDS.map((field) => ({
          value: field,
          label: TEXT_STYLE_FIELD_LABELS[field],
          disabled: field !== condition.field && disabledFields.has(field),
        }))}
        onValueChange={(field) =>
          onChange(
            createTextStyleMatchCondition(
              field as ConditionalBatchTextStyleField,
              condition.id,
            ),
          )
        }
      />
      <Select
        ariaLabel="부분 서식 비교 방식"
        value={condition.operator}
        options={operators}
        onValueChange={(operator) =>
          onChange({
            ...condition,
            operator: operator as ConditionalBatchTextStyleOperator,
            ...(operator === "between"
              ? { value2: Number(condition.value) }
              : { value2: undefined }),
          })
        }
      />
      <TextStyleMatchValueEditor condition={condition} onChange={onChange} />
      <IconButton label="부분 서식 조건 삭제" onClick={onDelete}>
        <IconTrash size={15} />
      </IconButton>
    </div>
  );
}

function TextStyleMatchValueEditor({
  condition,
  onChange,
}: {
  condition: ConditionalBatchTextStyleMatchCondition;
  onChange: (condition: ConditionalBatchTextStyleMatchCondition) => void;
}) {
  if (isTextStyleBooleanField(condition.field)) {
    return (
      <Select
        ariaLabel="부분 서식 값"
        value={condition.value === true ? "true" : "false"}
        options={[
          { value: "true", label: "켜짐" },
          { value: "false", label: "꺼짐" },
        ]}
        onValueChange={(value) =>
          onChange({ ...condition, value: value === "true" })
        }
      />
    );
  }
  if (condition.field === "fontFamily") {
    return (
      <FontSelect
        ariaLabel="비교할 부분 서식 글꼴"
        preserveFontId
        value={String(condition.value) || undefined}
        onChange={(fontFamily) =>
          onChange({ ...condition, value: fontFamily ?? DEFAULT_BLOCK_FONT_ID })
        }
      />
    );
  }
  if (isTextStyleColorField(condition.field)) {
    return (
      <ColorField
        label="부분 서식 색상"
        value={String(condition.value) || "#000000"}
        disabled={false}
        onChange={(value) => onChange({ ...condition, value })}
      />
    );
  }
  return (
    <TextStyleMatchNumberValue condition={condition} onChange={onChange} />
  );
}

function createTextStyleMatchCondition(
  field: ConditionalBatchTextStyleField,
  id = createConditionalBatchClientId("style-condition"),
): ConditionalBatchTextStyleMatchCondition {
  if (field === "fontFamily") {
    return { id, field, operator: "equals", value: DEFAULT_BLOCK_FONT_ID };
  }
  if (isTextStyleColorField(field)) {
    return { id, field, operator: "equals", value: "#000000" };
  }
  if (field === "sizePx") {
    return { id, field, operator: "greaterThanOrEqual", value: 24 };
  }
  if (field === "opacity" || field === "glowOpacity") {
    return { id, field, operator: "lessThanOrEqual", value: 1 };
  }
  if (field === "widthScale") {
    return { id, field, operator: "greaterThanOrEqual", value: 1 };
  }
  if (
    field === "outlineWidthPx" ||
    field === "outerOutlineWidthPx" ||
    field === "glowBlurPx"
  ) {
    return { id, field, operator: "greaterThanOrEqual", value: 1 };
  }
  return { id, field, operator: "equals", value: true };
}

function textStyleOperatorOptions(field: ConditionalBatchTextStyleField) {
  if (field === "fontFamily" || isTextStyleColorField(field)) {
    return [
      { value: "equals", label: "같음" },
      { value: "notEquals", label: "다름" },
    ];
  }
  if (isTextStyleBooleanField(field)) {
    return [{ value: "equals", label: "상태" }];
  }
  return [
    { value: "equals", label: "같음" },
    { value: "notEquals", label: "다름" },
    { value: "greaterThan", label: "초과" },
    { value: "greaterThanOrEqual", label: "이상" },
    { value: "lessThan", label: "미만" },
    { value: "lessThanOrEqual", label: "이하" },
    { value: "between", label: "범위" },
  ];
}

function isTextStyleBooleanField(
  field: ConditionalBatchTextStyleField,
): boolean {
  return [
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "emphasisMark",
  ].includes(field);
}

function isTextStyleColorField(field: ConditionalBatchTextStyleField): boolean {
  return [
    "color",
    "backgroundColor",
    "outlineColor",
    "outerOutlineColor",
    "glowColor",
  ].includes(field);
}

function textStyleNumberField(
  field: ConditionalBatchTextStyleField,
): ConditionalBatchWritableField {
  if (field === "opacity") return "textOpacity";
  if (field === "glowOpacity") return "textGlowOpacity";
  if (field === "widthScale") return "fontWidthScale";
  if (field === "glowBlurPx") return "textGlowBlur";
  if (field === "outlineWidthPx" || field === "outerOutlineWidthPx") {
    return field;
  }
  return "fontSizePx";
}

function StyleMatchActivationControls({
  action,
  matchStyle,
  onChange,
}: {
  action: ConditionalBatchStyleTextActionV2;
  matchStyle: ConditionalBatchStyleTextActionV2["matchStyle"];
  onChange: (action: ConditionalBatchActionV2) => void;
}) {
  return (
    <div className={styles.existingStyleMatchHeader}>
      <CheckboxField
        checked={Boolean(matchStyle)}
        label="기존 서식으로 범위 좁히기"
        onCheckedChange={(checked) =>
          onChange({
            ...action,
            matchStyle: checked
              ? {
                  logic: "all",
                  conditions: [createTextStyleMatchCondition("bold")],
                }
              : undefined,
          })
        }
      />
      {matchStyle && matchStyle.conditions.length > 1 ? (
        <SegmentedControl
          ariaLabel="부분 서식 조건 조합"
          singleRow
          value={matchStyle.logic}
          options={[
            { id: "all", label: "모두" },
            { id: "any", label: "하나라도" },
          ]}
          onChange={(logic) =>
            onChange({
              ...action,
              matchStyle: { ...matchStyle, logic },
            })
          }
        />
      ) : null}
    </div>
  );
}

function TextStyleMatchNumberValue({
  condition,
  onChange,
}: {
  condition: ConditionalBatchTextStyleMatchCondition;
  onChange: (condition: ConditionalBatchTextStyleMatchCondition) => void;
}) {
  const field = textStyleNumberField(condition.field);
  const presentation = resolveConditionalBatchNumberPresentation(
    field,
    Number(condition.value),
  );
  const end = resolveConditionalBatchNumberPresentation(
    field,
    condition.value2 ?? Number(condition.value),
  );
  return (
    <div className={styles.existingStyleNumberValue}>
      <NumberField
        ariaLabel="부분 서식 비교 값"
        variant="framed"
        min={presentation.min}
        max={presentation.max}
        step={presentation.step}
        precision={6}
        unit={presentation.unit}
        value={presentation.value}
        onValueChange={(value) =>
          onChange({ ...condition, value: presentation.toStoredValue(value) })
        }
      />
      {condition.operator === "between" ? (
        <>
          <span>~</span>
          <NumberField
            ariaLabel="부분 서식 범위 끝 값"
            variant="framed"
            min={end.min}
            max={end.max}
            step={end.step}
            precision={6}
            unit={end.unit}
            value={end.value}
            onValueChange={(value) =>
              onChange({ ...condition, value2: end.toStoredValue(value) })
            }
          />
        </>
      ) : null}
    </div>
  );
}
