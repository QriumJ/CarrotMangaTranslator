import type { TextStylePatch } from "../../../shared/richTextMarkup";
import type { RichTranslationSelectionValues } from "./richTranslationEditorTypes";

type Values = RichTranslationSelectionValues;

/**
 * Overlays a pending caret style on the values shown for the caret. A `null`
 * patch entry clears the letter style, so it falls back to the block value.
 */
export function applyTypingStyleToValues(
  values: Values,
  patch: TextStylePatch | null,
  fallback: Values,
): Values {
  if (!patch) return values;
  const typed: Partial<Values> = {
    ...resolveTypingEmphasis(patch, fallback),
    ...resolveTypingTypography(patch, fallback),
    ...resolveTypingAppearance(patch, fallback),
    ...resolveTypingEffects(patch, fallback),
    ...resolveTypingGlow(patch, fallback),
    ...resolveTypingShadow(patch, fallback),
  };
  return {
    ...values,
    ...typed,
    mixedFields: (values.mixedFields ?? []).filter((key) => !(key in typed)),
  };
}

function pick<Key extends keyof TextStylePatch, Result>(
  patch: TextStylePatch,
  key: Key,
  resolve: (value: NonNullable<TextStylePatch[Key]> | null) => Result,
): Result | Record<string, never> {
  const value = patch[key];
  if (value === undefined) return {};
  return resolve(value as NonNullable<TextStylePatch[Key]> | null);
}

function resolveTypingEmphasis(
  patch: TextStylePatch,
  fallback: Values,
): Partial<Values> {
  return {
    ...pick(patch, "bold", (bold) => ({ bold: bold ?? fallback.bold })),
    ...pick(patch, "italic", (italic) => ({
      italic: italic ?? fallback.italic,
    })),
    ...pick(patch, "underline", (underline) => ({
      underline: underline ?? fallback.underline,
    })),
    ...pick(patch, "strikethrough", (strikethrough) => ({
      strikethrough: strikethrough ?? fallback.strikethrough,
    })),
    ...pick(patch, "emphasisMark", (emphasisMark) => ({
      emphasisMark: emphasisMark ?? fallback.emphasisMark,
    })),
  };
}

function resolveTypingTypography(
  patch: TextStylePatch,
  fallback: Values,
): Partial<Values> {
  return {
    ...pick(patch, "sizePx", (sizePx) => ({
      sizePx: sizePx ?? fallback.sizePx,
      sizeMixed: false,
    })),
    ...pick(patch, "fontFamily", (fontFamily) => ({
      fontFamily: fontFamily ?? fallback.fontFamily,
      fontMixed: false,
    })),
    ...pick(patch, "opacity", (opacity) => ({
      opacityPercent:
        opacity === null ? fallback.opacityPercent : opacity * 100,
      opacityMixed: false,
    })),
    ...pick(patch, "widthScale", (widthScale) => ({
      widthPercent:
        widthScale === null ? fallback.widthPercent : widthScale * 100,
    })),
    ...pick(patch, "lineHeight", (lineHeight) => ({
      lineHeightPercent:
        lineHeight === null ? fallback.lineHeightPercent : lineHeight * 100,
    })),
    ...pick(patch, "letterSpacing", (letterSpacing) => ({
      letterSpacingEm: letterSpacing ?? fallback.letterSpacingEm,
    })),
  };
}

function resolveTypingAppearance(
  patch: TextStylePatch,
  fallback: Values,
): Partial<Values> {
  return {
    ...pick(patch, "color", (color) => ({ color: color ?? fallback.color })),
    ...pick(patch, "backgroundColor", (backgroundColor) => ({
      backgroundEnabled: backgroundColor !== null,
      backgroundColor: backgroundColor ?? fallback.backgroundColor,
    })),
    ...pick(patch, "backgroundOpacity", (backgroundOpacity) => ({
      backgroundOpacityPercent:
        backgroundOpacity === null
          ? fallback.backgroundOpacityPercent
          : backgroundOpacity * 100,
    })),
  };
}

function resolveTypingEffects(
  patch: TextStylePatch,
  fallback: Values,
): Partial<Values> {
  return {
    ...pick(patch, "outlineColor", (outlineColor) => ({
      outlineColor: outlineColor ?? fallback.outlineColor,
    })),
    ...pick(patch, "outlineWidthPx", (width) => ({
      outlineEnabled: (width ?? fallback.outlineWidthPx) > 0,
      outlineWidthPx: width ?? fallback.outlineWidthPx,
    })),
    ...pick(patch, "outerOutlineColor", (outerOutlineColor) => ({
      outerOutlineColor: outerOutlineColor ?? fallback.outerOutlineColor,
    })),
    ...pick(patch, "outerOutlineWidthPx", (width) => ({
      outerOutlineEnabled: (width ?? fallback.outerOutlineWidthPx) > 0,
      outerOutlineWidthPx: width ?? fallback.outerOutlineWidthPx,
    })),
  };
}

function resolveTypingGlow(
  patch: TextStylePatch,
  fallback: Values,
): Partial<Values> {
  return {
    ...pick(patch, "glowColor", (glowColor) => ({
      glowColor: glowColor ?? fallback.glowColor,
    })),
    ...pick(patch, "glowBlurPx", (glowBlurPx) => ({
      glowBlurPx: glowBlurPx ?? fallback.glowBlurPx,
    })),
    ...pick(patch, "glowOpacity", (glowOpacity) => {
      const opacity = glowOpacity ?? fallback.glowOpacityPercent / 100;
      return { glowEnabled: opacity > 0, glowOpacityPercent: opacity * 100 };
    }),
  };
}

function resolveTypingShadow(
  patch: TextStylePatch,
  fallback: Values,
): Partial<Values> {
  return {
    ...pick(patch, "shadowEnabled", (value) => ({
      shadowEnabled: value ?? fallback.shadowEnabled,
    })),
    ...pick(patch, "shadowColor", (value) => ({
      shadowColor: value ?? fallback.shadowColor,
    })),
    ...pick(patch, "shadowOffsetXpx", (value) => ({
      shadowOffsetXpx: value ?? fallback.shadowOffsetXpx,
    })),
    ...pick(patch, "shadowOffsetYpx", (value) => ({
      shadowOffsetYpx: value ?? fallback.shadowOffsetYpx,
    })),
    ...pick(patch, "shadowBlurPx", (value) => ({
      shadowBlurPx: value ?? fallback.shadowBlurPx,
    })),
    ...pick(patch, "shadowOpacity", (value) => ({
      shadowOpacityPercent:
        value === null ? fallback.shadowOpacityPercent : value * 100,
    })),
  };
}
