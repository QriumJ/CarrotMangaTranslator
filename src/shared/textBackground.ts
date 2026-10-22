import type { TranslationBlock } from "./textTypes";

/** Saved blocks without a value predate the setting and stay fully opaque. */
const DEFAULT_TEXT_BACKGROUND_OPACITY = 1;

type TextBackgroundSource = {
  textBackgroundEnabled?: unknown;
  textBackgroundColor?: unknown;
  textBackgroundOpacity?: unknown;
};

/** Opacity of the full text-area background fill only; text stays opaque. */
export function resolveTextBackgroundOpacity(
  source: TextBackgroundSource,
): number {
  const value = source.textBackgroundOpacity;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TEXT_BACKGROUND_OPACITY;
  }
  return Math.max(0, Math.min(1, value));
}

/**
 * A preset that defines the text-area background also defines its opacity;
 * presets saved before the setting existed meant an opaque fill.
 */
export function textBackgroundOpacityFormat(
  source: TextBackgroundSource,
): Pick<TranslationBlock, "textBackgroundOpacity"> {
  if (
    source.textBackgroundEnabled === undefined &&
    source.textBackgroundColor === undefined &&
    source.textBackgroundOpacity === undefined
  ) {
    return {};
  }
  return { textBackgroundOpacity: resolveTextBackgroundOpacity(source) };
}

/** The stored text-area background fields of a block or preset, as defined. */
export function textBackgroundFormat(
  source: Pick<
    TranslationBlock,
    "textBackgroundEnabled" | "textBackgroundColor" | "textBackgroundOpacity"
  >,
): Pick<
  TranslationBlock,
  "textBackgroundEnabled" | "textBackgroundColor" | "textBackgroundOpacity"
> {
  return {
    ...(source.textBackgroundEnabled === undefined
      ? {}
      : { textBackgroundEnabled: source.textBackgroundEnabled }),
    ...(source.textBackgroundColor === undefined
      ? {}
      : { textBackgroundColor: source.textBackgroundColor }),
    ...textBackgroundOpacityFormat(source),
  };
}
