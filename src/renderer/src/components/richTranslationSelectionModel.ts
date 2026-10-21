import { resolveRunTextEffect } from "../../../shared/richTextShadow";
import {
  parseRichText,
  type TextStylePatch,
  type TextStyleRun,
} from "../../../shared/richTextMarkup";
import { resolveTextGlow } from "../../../shared/textGlow";
import {
  resolveEffectiveTextColor,
  resolveEffectiveTextOutlineColor,
  resolveEffectiveTextOutlineWidthPx,
} from "../../../shared/textOutline";
import type { TranslationBlock } from "../../../shared/textTypes";
import type { RichTextEditorSelection } from "../lib/richTextEditorDom";
import type { RichTranslationSelectionValues } from "./richTranslationEditorTypes";
import { applyTypingStyleToValues } from "./richTranslationTypingStyleValues";

export function resolveRichTranslationSelectionValues(
  runs: readonly TextStyleRun[],
  selection: RichTextEditorSelection,
  block: TranslationBlock,
  caretRun: TextStyleRun | null,
  typingStyle: TextStylePatch | null,
): RichTranslationSelectionValues {
  const selected = selectRuns(runs, selection.start, selection.end);
  const inherited = caretRun ?? findCaretRun(runs, selection.start);
  const candidates =
    selected.length > 0 ? selected : inherited ? [inherited] : [];
  const base = createBaseSelectionValues(block);
  if (candidates.length === 0) {
    return applyTypingStyleToValues(base, typingStyle, base);
  }
  return applyTypingStyleToValues(
    resolveMixedSelectionValues(candidates, block, base),
    typingStyle,
    base,
  );
}

export function resolveRichTranslationCodeSelection(
  value: string,
  selection: RichTextEditorSelection,
  plainTextLength: number,
): RichTextEditorSelection {
  const from = clampSelectionOffset(
    value.length,
    Math.min(selection.start, selection.end),
  );
  const to = clampSelectionOffset(
    value.length,
    Math.max(selection.start, selection.end),
  );
  const startMarker = findUnusedSelectionMarker(value, "\ue000");
  const endMarker = findUnusedSelectionMarker(value + startMarker, "\ue001");
  const marked =
    value.slice(0, from) +
    startMarker +
    value.slice(from, to) +
    endMarker +
    value.slice(to);
  const plain = parseRichText(marked).plainText;
  const start = plain.indexOf(startMarker);
  const end = plain.indexOf(endMarker);
  if (start < 0 || end < start) return { start: 0, end: 0 };
  if (to > from) return { start, end: end - startMarker.length };
  return resolveCollapsedCodeSelection(start, plainTextLength);
}

export function normalizeRichTextOpacity(value: number | undefined): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value as number));
}

function resolveCandidateSelectionValues(
  candidates: readonly TextStyleRun[],
  block: TranslationBlock,
  base: RichTranslationSelectionValues,
): RichTranslationSelectionValues {
  const metrics = collectCandidateMetrics(candidates, block);
  return {
    ...base,
    bold: candidates.every((run) => Boolean(block.bold) || run.bold),
    italic: candidates.every((run) => Boolean(block.italic) || run.italic),
    underline: candidates.every(
      (run) => Boolean(block.underline) || run.underline,
    ),
    strikethrough: candidates.every(
      (run) => Boolean(block.strikethrough) || run.strikethrough,
    ),
    emphasisMark: candidates.every(
      (run) => Boolean(block.emphasisMark) || run.emphasisMark,
    ),
    lineHeightPercent: metrics.lineHeights[0] ?? base.lineHeightPercent,
    letterSpacingEm: metrics.letterSpacings[0] ?? base.letterSpacingEm,
    sizePx: metrics.sizes[0] ?? block.fontSizePx,
    sizeMixed: !allEqual(metrics.sizes),
    fontFamily: metrics.fonts[0],
    fontMixed: !allEqual(metrics.fonts),
    opacityPercent:
      metrics.opacities[0] ?? normalizeRichTextOpacity(block.textOpacity) * 100,
    opacityMixed: !allEqual(metrics.opacities),
    widthPercent: metrics.widths[0] ?? 100,
    color: metrics.colors[0] ?? base.color,
    backgroundEnabled: metrics.backgrounds.every(Boolean),
    backgroundColor: metrics.backgrounds.find(Boolean) ?? base.backgroundColor,
    ...resolveCandidateEffects(metrics, base),
    ...shadowValues(block, candidates[0]),
  };
}

/** Aggregate flags, not letter attributes, so never reported as mixed. */
const SUMMARY_FIELDS: ReadonlySet<keyof RichTranslationSelectionValues> =
  new Set(["mixedFields", "sizeMixed", "fontMixed", "opacityMixed"]);

function resolveMixedSelectionValues(
  candidates: readonly TextStyleRun[],
  block: TranslationBlock,
  base: RichTranslationSelectionValues,
): RichTranslationSelectionValues {
  const values = resolveCandidateSelectionValues(candidates, block, base);
  const individual = candidates.map((run) =>
    resolveCandidateSelectionValues([run], block, base),
  );
  return {
    ...values,
    mixedFields: (
      Object.keys(values) as (keyof RichTranslationSelectionValues)[]
    ).filter(
      (key) =>
        !SUMMARY_FIELDS.has(key) &&
        !allEqual(individual.map((value) => value[key])),
    ),
  };
}

function collectCandidateMetrics(
  candidates: readonly TextStyleRun[],
  block: TranslationBlock,
) {
  return {
    lineHeights: candidates.map(
      (run) => (run.lineHeight ?? block.lineHeight) * 100,
    ),
    letterSpacings: candidates.map(
      (run) => run.letterSpacing ?? block.letterSpacing ?? 0,
    ),
    sizes: candidates.map((run) => run.sizePx ?? block.fontSizePx),
    fonts: candidates.map((run) => run.fontFamily ?? block.fontFamily),
    opacities: candidates.map(
      (run) =>
        (run.opacity ?? normalizeRichTextOpacity(block.textOpacity)) * 100,
    ),
    widths: candidates.map(
      (run) => (run.widthScale ?? block.fontWidthScale ?? 1) * 100,
    ),
    colors: candidates.map(
      (run) => run.color ?? resolveEffectiveTextColor(block),
    ),
    backgrounds: candidates.map((run) => run.backgroundColor),
    outlineColors: candidates.map(
      (run) => run.outlineColor ?? resolveEffectiveTextOutlineColor(block),
    ),
    outlineWidths: candidates.map(
      (run) =>
        run.outlineWidthPx ??
        resolveEffectiveTextOutlineWidthPx(block, block.fontSizePx),
    ),
    outerOutlineColors: candidates.map(
      (run) => run.outerOutlineColor ?? block.outerOutlineColor ?? "#111111",
    ),
    outerOutlineWidths: candidates.map(
      (run) => run.outerOutlineWidthPx ?? block.outerOutlineWidthPx ?? 0,
    ),
    glows: candidates.map((run) => resolveSelectionGlow(block, run)),
  };
}

type CandidateMetrics = ReturnType<typeof collectCandidateMetrics>;

function resolveCandidateEffects(
  metrics: CandidateMetrics,
  base: RichTranslationSelectionValues,
): Pick<
  RichTranslationSelectionValues,
  | "outlineEnabled"
  | "outlineColor"
  | "outlineWidthPx"
  | "outerOutlineEnabled"
  | "outerOutlineColor"
  | "outerOutlineWidthPx"
  | "glowEnabled"
  | "glowColor"
  | "glowBlurPx"
  | "glowOpacityPercent"
> {
  return {
    outlineEnabled: metrics.outlineWidths.every((width) => width > 0),
    outlineColor: metrics.outlineColors[0] ?? base.outlineColor,
    outlineWidthPx: metrics.outlineWidths[0] ?? 0,
    outerOutlineEnabled: metrics.outerOutlineWidths.every((width) => width > 0),
    outerOutlineColor: metrics.outerOutlineColors[0] ?? base.outerOutlineColor,
    outerOutlineWidthPx: metrics.outerOutlineWidths[0] ?? 0,
    glowEnabled: metrics.glows.every((glow) => glow.enabled),
    glowColor: metrics.glows[0]?.color ?? base.glowColor,
    glowBlurPx: metrics.glows[0]?.blurPx ?? base.glowBlurPx,
    glowOpacityPercent:
      (metrics.glows[0]?.opacity ?? base.glowOpacityPercent / 100) * 100,
  };
}

function createBaseSelectionValues(
  block: TranslationBlock,
): RichTranslationSelectionValues {
  const glow = resolveTextGlow(block.textGlow);
  const outlineWidthPx = resolveEffectiveTextOutlineWidthPx(
    block,
    block.fontSizePx,
  );
  return {
    lineHeightPercent: block.lineHeight * 100,
    letterSpacingEm: block.letterSpacing ?? 0,
    mixedFields: [],
    bold: Boolean(block.bold),
    italic: Boolean(block.italic),
    underline: Boolean(block.underline),
    strikethrough: Boolean(block.strikethrough),
    emphasisMark: Boolean(block.emphasisMark),
    sizePx: block.fontSizePx,
    sizeMixed: false,
    fontFamily: block.fontFamily,
    fontMixed: false,
    opacityPercent: normalizeRichTextOpacity(block.textOpacity) * 100,
    opacityMixed: false,
    widthPercent: (block.fontWidthScale ?? 1) * 100,
    color: resolveEffectiveTextColor(block),
    backgroundEnabled: false,
    backgroundColor: "#ffffff",
    outlineEnabled: outlineWidthPx > 0,
    outlineColor: resolveEffectiveTextOutlineColor(block),
    outlineWidthPx,
    outerOutlineEnabled: (block.outerOutlineWidthPx ?? 0) > 0,
    outerOutlineColor: block.outerOutlineColor ?? "#111111",
    outerOutlineWidthPx: block.outerOutlineWidthPx ?? 0,
    ...shadowValues(block),
    glowEnabled: glow.enabled,
    glowColor: glow.color,
    glowBlurPx: glow.blurPx,
    glowOpacityPercent: glow.opacity * 100,
  };
}

function resolveSelectionGlow(block: TranslationBlock, run: TextStyleRun) {
  const base = resolveTextGlow(block.textGlow);
  const hasInline =
    run.glowColor !== undefined ||
    run.glowBlurPx !== undefined ||
    run.glowOpacity !== undefined;
  const opacity = hasInline
    ? (run.glowOpacity ?? base.opacity)
    : base.enabled
      ? base.opacity
      : 0;
  return {
    enabled: opacity > 0,
    color: run.glowColor ?? base.color,
    blurPx: run.glowBlurPx ?? base.blurPx,
    opacity,
  };
}

function findCaretRun(
  runs: readonly TextStyleRun[],
  offset: number,
): TextStyleRun | null {
  let consumed = 0;
  for (const run of runs) {
    consumed += run.text.length;
    if (offset <= consumed) return run;
  }
  return null;
}

function selectRuns(
  runs: readonly TextStyleRun[],
  start: number,
  end: number,
): TextStyleRun[] {
  if (end <= start) return [];
  const selected: TextStyleRun[] = [];
  let offset = 0;
  for (const run of runs) {
    const runEnd = offset + run.text.length;
    if (Math.max(start, offset) < Math.min(end, runEnd)) selected.push(run);
    offset = runEnd;
  }
  return selected;
}

function allEqual<T>(values: readonly T[]): boolean {
  return values.every((value) => Object.is(value, values[0]));
}

function clampSelectionOffset(length: number, value: number): number {
  return Math.max(0, Math.min(length, value));
}

function resolveCollapsedCodeSelection(
  start: number,
  plainTextLength: number,
): RichTextEditorSelection {
  const caret = Math.min(start, plainTextLength);
  return { start: caret, end: caret };
}

function findUnusedSelectionMarker(value: string, initial: string): string {
  let marker = initial;
  while (value.includes(marker)) marker += initial;
  return marker;
}

function shadowValues(block: TranslationBlock, run?: TextStyleRun) {
  const effect = resolveRunTextEffect(
    block,
    run ?? { bold: false, italic: false },
  );
  return {
    shadowEnabled: effect.enabled,
    shadowColor: effect.color,
    shadowOffsetXpx: effect.offsetXpx,
    shadowOffsetYpx: effect.offsetYpx,
    shadowBlurPx: effect.blurPx,
    shadowOpacityPercent: effect.opacity * 100,
  };
}
