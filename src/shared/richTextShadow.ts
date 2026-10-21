import type { TextStylePatch, TextStyleRun } from "./richTextMarkup";
import { resolveTextEffect } from "./textEffect";
import type { TextEffect, TranslationBlock } from "./textTypes";

/** Same shadow contract for frame defaults, ranges and insertion-point styles. */
export const TEXT_SHADOW_FIELDS = {
  shadowEnabled: "enabled",
  shadowColor: "color",
  shadowOffsetXpx: "offsetXpx",
  shadowOffsetYpx: "offsetYpx",
  shadowBlurPx: "blurPx",
  shadowOpacity: "opacity",
} as const;

export function hasInlineTextShadow(run: Omit<TextStyleRun, "text">): boolean {
  return Object.keys(TEXT_SHADOW_FIELDS).some(
    (key) => run[key as keyof typeof TEXT_SHADOW_FIELDS] !== undefined,
  );
}

export function resolveRunTextEffect(
  block: Pick<TranslationBlock, "textEffect">,
  run: Omit<TextStyleRun, "text">,
): TextEffect {
  const effect = resolveTextEffect(block.textEffect);
  for (const [inline, field] of Object.entries(TEXT_SHADOW_FIELDS)) {
    const value = run[inline as keyof typeof TEXT_SHADOW_FIELDS];
    if (value !== undefined) Object.assign(effect, { [field]: value });
  }
  return resolveTextEffect(effect);
}

/** Empty input returns no block mutation; null removes that inline override. */
export function shadowPatchToBlockEffect(
  block: Pick<TranslationBlock, "textEffect">,
  patch: TextStylePatch,
): TextEffect | undefined {
  const effect = resolveTextEffect(block.textEffect);
  let changed = false;
  for (const [inline, field] of Object.entries(TEXT_SHADOW_FIELDS)) {
    const value = patch[inline as keyof typeof TEXT_SHADOW_FIELDS];
    if (value === undefined || value === null) continue;
    Object.assign(effect, { [field]: value });
    changed = true;
  }
  return changed ? resolveTextEffect(effect) : undefined;
}
