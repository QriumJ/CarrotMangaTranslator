import { useTranslation } from "react-i18next";
import styles from "./EditorTextEffectControls.module.css";
import type { TextEffect, TextGlow } from "../../../shared/textTypes";
import {
  MAX_TEXT_EFFECT_BLUR_PX,
  MAX_TEXT_EFFECT_OFFSET_PX,
  MIN_TEXT_EFFECT_BLUR_PX,
  MIN_TEXT_EFFECT_OFFSET_PX,
  TEXT_EFFECT_LENGTH_STEP_PX,
  resolveTextEffect,
} from "../../../shared/textEffect";
import {
  MAX_TEXT_GLOW_BLUR_PX,
  MIN_TEXT_GLOW_BLUR_PX,
  TEXT_GLOW_BLUR_STEP_PX,
  resolveTextGlow,
} from "../../../shared/textGlow";
import { ColorField } from "./ColorField";
import { CheckboxField } from "./ui/CheckboxField";
import { EditorNumberField } from "./EditorNumberField";

export function TextGlowControls({
  disabled,
  glow,
  mixed,
  mixedFields,
  onChange,
}: {
  disabled: boolean;
  glow: TextGlow | undefined;
  mixed: boolean;
  mixedFields?: Partial<Record<keyof TextGlow, boolean>>;
  onChange: (glow: TextGlow, patch: Partial<TextGlow>) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const value = resolveTextGlow(glow);
  const update = (patch: Partial<TextGlow>): void =>
    onChange({ ...value, ...patch }, patch);
  const isMixed = (field: keyof TextGlow): boolean =>
    mixedFields ? Boolean(mixedFields[field]) : mixed;
  const label = t("format.textGlow.title", { defaultValue: "광선" });
  return (
    <div
      className={`text-effect-controls text-glow-controls ${styles.effect}`}
      data-enabled={value.enabled}
    >
      <div className="text-effect-control-head">
        <CheckboxField
          className="editor-appearance-toggle text-effect-enabled-toggle"
          label={label}
          checked={value.enabled}
          indeterminate={isMixed("enabled")}
          disabled={disabled}
          onCheckedChange={(enabled) =>
            update({ enabled: isMixed("enabled") ? true : enabled })
          }
        />
        {value.enabled || isMixed("enabled") ? (
          <ColorField
            className="editor-appearance-color"
            label={t("format.textGlow.color", { defaultValue: "광선색" })}
            labelHidden
            value={value.color}
            disabled={disabled}
            mixed={isMixed("color")}
            onChange={(color) => update({ color })}
          />
        ) : null}
      </div>
      {value.enabled || isMixed("enabled") ? (
        <div className="text-effect-number-grid text-glow-number-grid">
          <EditorNumberField
            disabled={disabled}
            label={t("format.textGlow.blur", { defaultValue: "번짐" })}
            min={MIN_TEXT_GLOW_BLUR_PX}
            max={MAX_TEXT_GLOW_BLUR_PX}
            step={TEXT_GLOW_BLUR_STEP_PX}
            value={value.blurPx}
            mixed={isMixed("blurPx")}
            onChange={(blurPx) => update({ blurPx })}
          />
          <EditorNumberField
            disabled={disabled}
            label={t("format.textGlow.opacity", { defaultValue: "불투명도" })}
            min={0}
            max={100}
            precision={0}
            step={1}
            unit="%"
            value={Math.round(value.opacity * 100)}
            mixed={isMixed("opacity")}
            onChange={(opacity) => update({ opacity: opacity / 100 })}
          />
        </div>
      ) : null}
    </div>
  );
}

export type TextEffectMixedFields = Partial<Record<keyof TextEffect, boolean>>;

/**
 * Directional shadow. `patch` carries only the edited field so a mixed letter
 * selection keeps every other shadow value; `mixedFields` marks per field.
 */
export function TextEffectControls({
  disabled,
  effect,
  mixed = false,
  mixedFields,
  onChange,
}: {
  disabled: boolean;
  effect: TextEffect | undefined;
  mixed?: boolean;
  mixedFields?: TextEffectMixedFields;
  onChange: (effect: TextEffect, patch: Partial<TextEffect>) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const value = resolveTextEffect(effect);
  const update = (patch: Partial<TextEffect>): void =>
    onChange({ ...value, ...patch }, patch);
  const isMixed = (field: keyof TextEffect): boolean =>
    mixedFields ? Boolean(mixedFields[field]) : mixed;
  const expanded = value.enabled || isMixed("enabled");
  return (
    <div
      className={`text-effect-controls ${styles.effect}`}
      data-enabled={value.enabled}
    >
      <div className="text-effect-control-head">
        <CheckboxField
          className="editor-appearance-toggle text-effect-enabled-toggle"
          label={t("format.textEffect.enabled")}
          checked={value.enabled}
          indeterminate={isMixed("enabled")}
          disabled={disabled}
          onCheckedChange={(enabled) =>
            update({ enabled: isMixed("enabled") ? true : enabled })
          }
        />
        {expanded ? (
          <ColorField
            className="editor-appearance-color"
            label={t("format.textEffect.color")}
            labelHidden
            value={value.color}
            disabled={disabled}
            mixed={isMixed("color")}
            onChange={(color) => update({ color })}
          />
        ) : null}
      </div>
      {expanded ? (
        <TextEffectNumberGrid
          disabled={disabled}
          isMixed={isMixed}
          value={value}
          onUpdate={update}
        />
      ) : null}
    </div>
  );
}

function TextEffectNumberGrid({
  disabled,
  isMixed,
  onUpdate,
  value,
}: {
  disabled: boolean;
  isMixed: (field: keyof TextEffect) => boolean;
  onUpdate: (patch: Partial<TextEffect>) => void;
  value: TextEffect;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className="text-effect-number-grid">
      <EditorNumberField
        disabled={disabled}
        step={TEXT_EFFECT_LENGTH_STEP_PX}
        label={t("format.textEffect.offsetX")}
        min={MIN_TEXT_EFFECT_OFFSET_PX}
        max={MAX_TEXT_EFFECT_OFFSET_PX}
        value={value.offsetXpx}
        mixed={isMixed("offsetXpx")}
        onChange={(offsetXpx) => onUpdate({ offsetXpx })}
      />
      <EditorNumberField
        disabled={disabled}
        step={TEXT_EFFECT_LENGTH_STEP_PX}
        label={t("format.textEffect.offsetY")}
        min={MIN_TEXT_EFFECT_OFFSET_PX}
        max={MAX_TEXT_EFFECT_OFFSET_PX}
        value={value.offsetYpx}
        mixed={isMixed("offsetYpx")}
        onChange={(offsetYpx) => onUpdate({ offsetYpx })}
      />
      <EditorNumberField
        disabled={disabled}
        step={TEXT_EFFECT_LENGTH_STEP_PX}
        label={t("format.textEffect.blur")}
        min={MIN_TEXT_EFFECT_BLUR_PX}
        max={MAX_TEXT_EFFECT_BLUR_PX}
        value={value.blurPx}
        mixed={isMixed("blurPx")}
        onChange={(blurPx) => onUpdate({ blurPx })}
      />
      <EditorNumberField
        disabled={disabled}
        label={t("format.textEffect.opacity")}
        min={0}
        max={100}
        precision={0}
        step={1}
        unit="%"
        value={Math.round(value.opacity * 100)}
        mixed={isMixed("opacity")}
        onChange={(opacity) => onUpdate({ opacity: opacity / 100 })}
      />
    </div>
  );
}
