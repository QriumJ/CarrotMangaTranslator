import { createConditionalLiteralMatcher } from "../../../shared/conditionalTextPattern";

import {
  type ConditionalBatchActionV2,
  type ConditionalBatchStyleTextActionV2,
} from "../../../shared/conditionalBatchRules";

import { type TextStylePatch } from "../../../shared/richTextMarkup";

import { CheckboxField } from "./ui/CheckboxField";
import { Select } from "./ui/Select";

import { Field } from "./ui/Field";

import { ConditionalPatternBuilder } from "./ConditionalPatternBuilder";

import styles from "./ConditionalBatchEditor.module.css";

import { updatePatch } from "./conditionalBatchActionModel";

import { ExistingStyleMatchEditor } from "./ConditionalBatchStyleMatchEditor";

import {
  PatchBoolean,
  PatchColorValue,
  PatchFontValue,
  PatchValue,
} from "./ConditionalBatchStylePatchFields";

export function StyleTextActionEditor({
  action,
  sampleText,
  onChange,
}: {
  action: ConditionalBatchStyleTextActionV2;
  sampleText?: string;
  onChange: (action: ConditionalBatchActionV2) => void;
}) {
  const updateStyle = <Key extends keyof TextStylePatch>(
    key: Key,
    value: TextStylePatch[Key] | undefined,
  ): void => {
    onChange({
      ...action,
      patch: updatePatch(action.patch, key, value),
    });
  };
  return (
    <>
      <StyleTextScopeControls action={action} onChange={onChange} />
      {action.scope === "pattern" && action.matcher ? (
        <ConditionalPatternBuilder
          matcher={action.matcher}
          sampleText={sampleText}
          onChangeMatcher={(matcher) => onChange({ ...action, matcher })}
        />
      ) : null}
      <ExistingStyleMatchEditor action={action} onChange={onChange} />
      <h4>글꼴과 글자 모양</h4>
      <StyleTextFontControls action={action} updateStyle={updateStyle} />
      <StyleTextEffectControls action={action} updateStyle={updateStyle} />
      {action.scope === "pattern" ? (
        <div className={styles.actionToggles}>
          <CheckboxField
            checked={action.allOccurrences}
            label="모든 일치 항목"
            onCheckedChange={(allOccurrences) =>
              onChange({ ...action, allOccurrences })
            }
          />
        </div>
      ) : null}
    </>
  );
}

function StyleTextScopeControls({
  action,
  onChange,
}: {
  action: ConditionalBatchStyleTextActionV2;
  onChange: (action: ConditionalBatchActionV2) => void;
}) {
  return (
    <div className={styles.actionOptions}>
      <Field as="div" label="서식 범위">
        <Select
          ariaLabel="서식 범위"
          value={action.scope}
          options={[
            { value: "allText", label: "문장 전체" },
            { value: "pattern", label: "찾은 글자만" },
          ]}
          onValueChange={(scope) =>
            onChange({
              ...action,
              scope: scope as ConditionalBatchStyleTextActionV2["scope"],
              matcher:
                scope === "pattern"
                  ? (action.matcher ?? createConditionalLiteralMatcher(""))
                  : undefined,
            })
          }
        />
      </Field>
      <Field as="div" label="기존 부분 서식">
        <Select
          ariaLabel="부분 서식 적용 방식"
          value={action.styleMode}
          options={[
            { value: "overwrite", label: "지정 항목 덮어쓰기" },
            { value: "fillMissing", label: "빈 값만 채우기" },
            { value: "replace", label: "기존 서식 지우고 교체" },
          ]}
          onValueChange={(styleMode) =>
            onChange({
              ...action,
              styleMode:
                styleMode as ConditionalBatchStyleTextActionV2["styleMode"],
            })
          }
        />
      </Field>
    </div>
  );
}

function StyleTextFontControls({
  action,
  updateStyle,
}: {
  action: ConditionalBatchStyleTextActionV2;
  updateStyle: <Key extends keyof TextStylePatch>(
    key: Key,
    value: TextStylePatch[Key] | undefined,
  ) => void;
}) {
  return (
    <div className={styles.inlineStyleGrid}>
      <PatchBoolean
        label="굵게"
        value={action.patch.bold}
        onChange={(bold) => updateStyle("bold", bold)}
      />
      <PatchBoolean
        label="기울임"
        value={action.patch.italic}
        onChange={(italic) => updateStyle("italic", italic)}
      />
      <PatchBoolean
        label="밑줄"
        value={action.patch.underline}
        onChange={(underline) => updateStyle("underline", underline)}
      />
      <PatchBoolean
        label="취소선"
        value={action.patch.strikethrough}
        onChange={(strikethrough) =>
          updateStyle("strikethrough", strikethrough)
        }
      />
      <PatchBoolean
        label="강조점"
        value={action.patch.emphasisMark}
        onChange={(emphasisMark) => updateStyle("emphasisMark", emphasisMark)}
      />
      <PatchValue
        label="글자 크기"
        field="fontSizePx"
        value={action.patch.sizePx}
        onChange={(sizePx) => updateStyle("sizePx", sizePx)}
      />
      <PatchFontValue
        value={action.patch.fontFamily}
        onChange={(fontFamily) => updateStyle("fontFamily", fontFamily)}
      />
      <PatchValue
        label="글자 투명도"
        field="textOpacity"
        value={action.patch.opacity}
        onChange={(opacity) => updateStyle("opacity", opacity)}
      />
      <PatchValue
        label="장평"
        field="fontWidthScale"
        value={action.patch.widthScale}
        onChange={(widthScale) => updateStyle("widthScale", widthScale)}
      />
    </div>
  );
}

function StyleTextEffectControls({
  action,
  updateStyle,
}: {
  action: ConditionalBatchStyleTextActionV2;
  updateStyle: <Key extends keyof TextStylePatch>(
    key: Key,
    value: TextStylePatch[Key] | undefined,
  ) => void;
}) {
  return (
    <div className={styles.inlineStyleAdvanced}>
      <h4>색과 효과</h4>
      <div className={styles.inlineStyleGrid}>
        <PatchColorValue
          label="글자색"
          value={action.patch.color}
          onChange={(color) => updateStyle("color", color)}
        />
        <PatchColorValue
          label="글자 배경색"
          value={action.patch.backgroundColor}
          onChange={(backgroundColor) =>
            updateStyle("backgroundColor", backgroundColor)
          }
        />
        <PatchColorValue
          label="외곽선색"
          value={action.patch.outlineColor}
          onChange={(outlineColor) => updateStyle("outlineColor", outlineColor)}
        />
        <PatchValue
          label="외곽선 두께"
          field="outlineWidthPx"
          value={action.patch.outlineWidthPx}
          onChange={(outlineWidthPx) =>
            updateStyle("outlineWidthPx", outlineWidthPx)
          }
        />
        <PatchColorValue
          label="바깥 외곽선색"
          value={action.patch.outerOutlineColor}
          onChange={(outerOutlineColor) =>
            updateStyle("outerOutlineColor", outerOutlineColor)
          }
        />
        <PatchValue
          label="바깥 외곽선 두께"
          field="outerOutlineWidthPx"
          value={action.patch.outerOutlineWidthPx}
          onChange={(outerOutlineWidthPx) =>
            updateStyle("outerOutlineWidthPx", outerOutlineWidthPx)
          }
        />
        <PatchColorValue
          label="광선색"
          value={action.patch.glowColor}
          onChange={(glowColor) => updateStyle("glowColor", glowColor)}
        />
        <PatchValue
          label="광선 퍼짐"
          field="textGlowBlur"
          value={action.patch.glowBlurPx}
          onChange={(glowBlurPx) => updateStyle("glowBlurPx", glowBlurPx)}
        />
        <PatchValue
          label="광선 불투명도"
          field="textGlowOpacity"
          value={action.patch.glowOpacity}
          onChange={(glowOpacity) => updateStyle("glowOpacity", glowOpacity)}
        />
      </div>
    </div>
  );
}
