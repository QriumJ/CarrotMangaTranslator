import type { PanelFormatPatch } from "./panelBridgeTypes";
import { resolveTextEffect } from "./textEffect";
import { TEXT_SHADOW_FIELDS, shadowPatchToBlockEffect } from "./richTextShadow";
import {
  applyTextStyleToRuns,
  parseRichText,
  serializeRichTextRuns,
  type TextStylePatch,
  type TextStyleRun,
} from "./richTextMarkup";
import type { TranslationBlock } from "./textTypes";

const CHARACTER_FIELDS = {
  bold: "bold",
  italic: "italic",
  underline: "underline",
  strikethrough: "strikethrough",
  emphasisMark: "emphasisMark",
  sizePx: "fontSizePx",
  fontFamily: "fontFamily",
  opacity: "textOpacity",
  widthScale: "fontWidthScale",
  lineHeight: "lineHeight",
  letterSpacing: "letterSpacing",
  color: "textColor",
  outlineColor: "outlineColor",
  outlineWidthPx: "outlineWidthPx",
  outerOutlineColor: "outerOutlineColor",
  outerOutlineWidthPx: "outerOutlineWidthPx",
} as const;
const EMPHASIS = [
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "emphasisMark",
] as const;

/** Direct frame formatting replaces just the changed character attribute. */
export function applyBlockCharacterFormat(
  block: TranslationBlock,
  patch: TextStylePatch,
): Partial<TranslationBlock> {
  const blockPatch: Partial<TranslationBlock> = {};
  const runPatch: TextStylePatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const field = CHARACTER_FIELDS[key as keyof typeof CHARACTER_FIELDS];
    if (key in TEXT_SHADOW_FIELDS) {
      Object.assign(runPatch, { [key]: null });
    } else if (field) {
      Object.assign(blockPatch, { [field]: value ?? undefined });
      Object.assign(runPatch, { [key]: null });
    } else {
      Object.assign(runPatch, { [key]: value });
    }
  }
  const shadow = shadowPatchToBlockEffect(block, patch);
  if (shadow) blockPatch.textEffect = shadow;
  if (patch.sizePx !== undefined) {
    blockPatch.autoFitText = false;
    blockPatch.fontSizeIntent = "manual";
  }
  const parsed = parseRichText(block.translatedText);
  const runs = applyTextStyleToRuns(
    parsed.runs,
    0,
    parsed.plainText.length,
    runPatch,
  );
  return { ...blockPatch, translatedText: serializeRichTextRuns(runs) };
}

/** Existing emphasis uses additive block flags. Materialize only a changed
 * flag before a local edit so turning it off does not change other letters. */
export function applySelectionCharacterFormat(
  block: TranslationBlock,
  runs: readonly TextStyleRun[],
  start: number,
  end: number,
  patch: TextStylePatch,
): { runs: TextStyleRun[]; blockPatch: Partial<TranslationBlock> } {
  const blockPatch: Partial<TranslationBlock> = {};
  let effective = runs.map((run) => ({ ...run }));
  for (const key of EMPHASIS) {
    if (patch[key] === undefined || !block[key]) continue;
    effective = effective.map((run) => ({ ...run, [key]: true }));
    Object.assign(blockPatch, { [key]: false });
  }
  return {
    runs: applyTextStyleToRuns(effective, start, end, patch),
    blockPatch,
  };
}

export function clearChangedCharacterOverrides(
  block: TranslationBlock,
  patch: Partial<TranslationBlock>,
): Partial<TranslationBlock> {
  if (patch.translatedText !== undefined) return patch;
  const clear: TextStylePatch = {};
  const parsed = parseRichText(block.translatedText);
  for (const [key, field] of Object.entries(CHARACTER_FIELDS)) {
    if (!Object.hasOwn(patch, field)) continue;
    if (
      !parsed.runs.some((run) => {
        const value = run[key as keyof TextStyleRun];
        return value !== undefined && value !== false;
      })
    )
      continue;
    Object.assign(clear, { [key]: null });
  }
  if (Object.hasOwn(patch, "textEffect")) {
    const before = resolveTextEffect(block.textEffect);
    const after = resolveTextEffect(patch.textEffect);
    for (const [inline, field] of Object.entries(TEXT_SHADOW_FIELDS)) {
      if (after[field] !== before[field]) {
        Object.assign(clear, { [inline]: null });
      }
    }
  }
  if (!Object.keys(clear).length) return patch;
  return {
    ...patch,
    translatedText: serializeRichTextRuns(
      applyTextStyleToRuns(parsed.runs, 0, parsed.plainText.length, clear),
    ),
  };
}

/** Resolve transient multi-frame intent separately for each frame, before persistence. */
export function applySelectedBlockFormatPatch(
  block: TranslationBlock,
  patch: Partial<TranslationBlock>,
): Partial<TranslationBlock> {
  const { textEffectFields, ...direct } = patch as PanelFormatPatch;
  if (!textEffectFields || !direct.textEffect) return direct;
  const character: TextStylePatch = {};
  for (const [inline, field] of Object.entries(TEXT_SHADOW_FIELDS)) {
    if (textEffectFields.includes(field)) {
      Object.assign(character, { [inline]: direct.textEffect[field] });
    }
  }
  return { ...direct, ...applyBlockCharacterFormat(block, character) };
}
