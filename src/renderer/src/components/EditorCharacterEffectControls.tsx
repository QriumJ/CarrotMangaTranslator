import React from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_TEXT_GLOW } from "../../../shared/textGlow";
import {
  DEFAULT_MANUAL_TEXT_OUTLINE_WIDTH_PX,
  snapTextOutlineWidthPx,
} from "../../../shared/textOutline";
import type { TextStylePatch } from "../../../shared/richTextMarkup";
import type { TextEffect, TextGlow } from "../../../shared/textTypes";
import { BackgroundFillFields } from "./EditorColorGroup";
import type { CharacterFormatTarget } from "./editorCharacterFormatTarget";
import {
  OutlineControl,
  type OutlineControlModel,
} from "./EditorOutlineControls";
import {
  TextEffectControls,
  TextGlowControls,
} from "./EditorTextEffectControls";

type EffectProps = { disabled: boolean; target: CharacterFormatTarget };

/**
 * Outline, outer outline, shadow, glow and letter background for the format
 * target, so each follows the same block/range/caret/blocks scope.
 */
export function EditorCharacterEffectControls(
  props: EffectProps,
): React.JSX.Element {
  return (
    <div className="editor-appearance-list">
      <CharacterOutline {...props} />
      <CharacterOuterOutline {...props} />
      <CharacterShadow {...props} />
      <CharacterGlow {...props} />
      {props.target.supportsCharacterBackground ? (
        <CharacterBackground {...props} />
      ) : null}
    </div>
  );
}

function CharacterOutline({
  disabled,
  target,
}: EffectProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const { mixed, values } = target;
  const control = useOutlineControlModel(values.outlineWidthPx, (width) =>
    target.apply({ outlineWidthPx: width }),
  );
  return (
    <OutlineControl
      color={values.outlineColor}
      colorLabel={t("format.outline")}
      colorMixed={mixed.has("outlineColor")}
      control={{ ...control, enabled: values.outlineEnabled }}
      disabled={disabled}
      enabledLabel={t("settings.format.color.outlineEnabled")}
      widthLabel={t("gatherText.outlineWidth")}
      widthMixed={mixed.has("outlineEnabled") || mixed.has("outlineWidthPx")}
      onColorChange={(outlineColor) => target.apply({ outlineColor })}
    />
  );
}

function CharacterOuterOutline({
  disabled,
  target,
}: EffectProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const { mixed, values } = target;
  const control = useOutlineControlModel(values.outerOutlineWidthPx, (width) =>
    target.apply({
      outerOutlineWidthPx: width,
    }),
  );
  return (
    <OutlineControl
      color={values.outerOutlineColor}
      colorLabel={t("format.outerOutline.color")}
      colorMixed={mixed.has("outerOutlineColor")}
      control={{ ...control, enabled: values.outerOutlineEnabled }}
      disabled={disabled}
      enabledLabel={t("format.outerOutline.enabled")}
      widthLabel={t("format.outerOutline.width")}
      widthMixed={
        mixed.has("outerOutlineEnabled") || mixed.has("outerOutlineWidthPx")
      }
      onColorChange={(outerOutlineColor) => target.apply({ outerOutlineColor })}
    />
  );
}

/** Shadow fields of the selection values, keyed by the shadow control field. */
const SHADOW_FIELDS = {
  enabled: "shadowEnabled",
  color: "shadowColor",
  offsetXpx: "shadowOffsetXpx",
  offsetYpx: "shadowOffsetYpx",
  blurPx: "shadowBlurPx",
  opacity: "shadowOpacityPercent",
} as const satisfies Record<keyof TextEffect, string>;

function CharacterShadow({ disabled, target }: EffectProps): React.JSX.Element {
  const { mixed, values } = target;
  const effect: TextEffect = {
    enabled: values.shadowEnabled,
    color: values.shadowColor,
    offsetXpx: values.shadowOffsetXpx,
    offsetYpx: values.shadowOffsetYpx,
    blurPx: values.shadowBlurPx,
    opacity: values.shadowOpacityPercent / 100,
  };
  return (
    <TextEffectControls
      disabled={disabled}
      effect={effect}
      mixedFields={{
        enabled: mixed.has(SHADOW_FIELDS.enabled),
        color: mixed.has(SHADOW_FIELDS.color),
        offsetXpx: mixed.has(SHADOW_FIELDS.offsetXpx),
        offsetYpx: mixed.has(SHADOW_FIELDS.offsetYpx),
        blurPx: mixed.has(SHADOW_FIELDS.blurPx),
        opacity: mixed.has(SHADOW_FIELDS.opacity),
      }}
      onChange={(_next, patch) => target.apply(shadowStylePatch(patch))}
    />
  );
}

/** One edited shadow field becomes one style key; mixed others stay put. */
function shadowStylePatch(patch: Partial<TextEffect>): TextStylePatch {
  const next: TextStylePatch = {};
  if (patch.enabled !== undefined) next.shadowEnabled = patch.enabled;
  if (patch.color !== undefined) next.shadowColor = patch.color;
  if (patch.offsetXpx !== undefined) next.shadowOffsetXpx = patch.offsetXpx;
  if (patch.offsetYpx !== undefined) next.shadowOffsetYpx = patch.offsetYpx;
  if (patch.blurPx !== undefined) next.shadowBlurPx = patch.blurPx;
  if (patch.opacity !== undefined) next.shadowOpacity = patch.opacity;
  return next;
}

const GLOW_FIELDS = [
  "glowEnabled",
  "glowColor",
  "glowBlurPx",
  "glowOpacityPercent",
] as const;

function CharacterGlow({ disabled, target }: EffectProps): React.JSX.Element {
  const { values } = target;
  const glow: TextGlow = {
    enabled: values.glowEnabled,
    color: values.glowColor,
    blurPx: values.glowBlurPx,
    opacity: values.glowOpacityPercent / 100,
  };
  return (
    <TextGlowControls
      disabled={disabled}
      glow={glow}
      mixed={GLOW_FIELDS.some((field) => target.mixed.has(field))}
      mixedFields={{
        enabled: target.mixed.has("glowEnabled"),
        color: target.mixed.has("glowColor"),
        blurPx: target.mixed.has("glowBlurPx"),
        opacity: target.mixed.has("glowOpacityPercent"),
      }}
      onChange={(_next, patch) => {
        if (patch.color !== undefined) target.apply({ glowColor: patch.color });
        if (patch.blurPx !== undefined)
          target.apply({ glowBlurPx: patch.blurPx });
        if (patch.opacity !== undefined)
          target.apply({ glowOpacity: patch.opacity });
        if (patch.enabled !== undefined)
          target.apply({
            glowOpacity: patch.enabled
              ? values.glowOpacityPercent > 0
                ? values.glowOpacityPercent / 100
                : DEFAULT_TEXT_GLOW.opacity
              : 0,
          });
      }}
    />
  );
}

/**
 * Letter background for the format target's letters. Its opacity fades only
 * the fill; 100% is stored as no value so plain backgrounds stay unchanged.
 */
function CharacterBackground({
  disabled,
  target,
}: EffectProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const { mixed, values } = target;
  return (
    <BackgroundFillFields
      disabled={disabled}
      enabledLabel={t("editor.richText.background")}
      opacityLabel={t("editor.richText.backgroundOpacity")}
      fill={{
        enabled: values.backgroundEnabled,
        enabledMixed: mixed.has("backgroundEnabled"),
        color: values.backgroundColor,
        colorMixed: mixed.has("backgroundColor"),
        opacityPercent: Math.round(values.backgroundOpacityPercent),
        opacityMixed: mixed.has("backgroundOpacityPercent"),
      }}
      onToggle={(enabled) =>
        target.apply(
          enabled
            ? { backgroundColor: values.backgroundColor }
            : { backgroundColor: null, backgroundOpacity: null },
        )
      }
      onColorChange={(backgroundColor) => target.apply({ backgroundColor })}
      onOpacityChange={(percent) =>
        target.apply({
          backgroundOpacity: percent >= 100 ? null : percent / 100,
        })
      }
    />
  );
}

/**
 * Checkbox, color and width for one outline. Turning it back on restores the
 * last positive width used in this panel session.
 */
function useOutlineControlModel(
  widthPx: number,
  onWidthChange: (widthPx: number) => void,
): OutlineControlModel {
  const lastPositiveWidth = React.useRef(
    widthPx > 0
      ? snapTextOutlineWidthPx(widthPx)
      : DEFAULT_MANUAL_TEXT_OUTLINE_WIDTH_PX,
  );
  React.useEffect(() => {
    if (widthPx > 0)
      lastPositiveWidth.current = snapTextOutlineWidthPx(widthPx);
  }, [widthPx]);
  return {
    enabled: widthPx > 0,
    widthPx,
    toggle: (checked) => onWidthChange(checked ? lastPositiveWidth.current : 0),
    updateWidth: (value) => {
      const normalized = snapTextOutlineWidthPx(value);
      if (normalized > 0) lastPositiveWidth.current = normalized;
      onWidthChange(normalized);
    },
  };
}
