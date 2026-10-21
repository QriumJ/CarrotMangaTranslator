import { resolveRunTextEffect } from "../../../shared/richTextShadow";
import { resolveTextEffectCssShadow } from "../../../shared/textEffect";
import type React from "react";
import { getTextMeasureContext } from "./blockTextMeasurement";
import type { TextStyleRun } from "../../../shared/richTextMarkup";
import {
  resolveTextGlow,
  resolveTextGlowCssShadow,
} from "../../../shared/textGlow";
import {
  MIN_AUTOMATIC_TEXT_OUTLINE_CONTRAST_RATIO,
  resolveAutomaticTextOutlineColor,
  resolveEffectiveTextColor,
  resolveEffectiveTextOutlineColor,
  resolveEffectiveTextOutlineWidthPx,
  resolveTextOutlineContrastRatio,
} from "../../../shared/textOutline";
import type {
  RenderTextDirection,
  TranslationBlock,
} from "../../../shared/textTypes";

const DEFAULT_OUTER_OUTLINE_COLOR = "#111111";
/** Contrast stand-ins for the two editor field tones (see formatting.css). */
const EDITOR_SURFACE_COLORS = { light: "#ffffff", dark: "#111111" } as const;
/** Outlines preview as a thin ring; the canvas keeps the real width. */
const EDITOR_OUTLINE_PREVIEW_MAX_PX = 1.5;

export type EditorSurfaceTone = keyof typeof EDITOR_SURFACE_COLORS;

/**
 * The translation field takes the side of the block's base ink, like paper
 * under dark lettering, so ordinary text needs no per-run backing.
 */
export function resolveEditorSurfaceTone(
  block: TranslationBlock,
): EditorSurfaceTone {
  const ink = resolveEffectiveTextColor(block);
  return resolveTextOutlineContrastRatio(ink, EDITOR_SURFACE_COLORS.light) >=
    resolveTextOutlineContrastRatio(ink, EDITOR_SURFACE_COLORS.dark)
    ? "light"
    : "dark";
}

export type TextRunDecorations = Readonly<{
  strikethrough: boolean;
  underline: boolean;
}>;

export function resolveRunTextDecorations(
  block: TranslationBlock,
  run: Pick<TextStyleRun, "strikethrough" | "underline">,
): TextRunDecorations {
  return {
    strikethrough: Boolean(block.strikethrough || run.strikethrough),
    underline: Boolean(block.underline || run.underline),
  };
}

export function resolveMainRunVisualStyle(
  block: TranslationBlock,
  run: TextStyleRun,
  renderedBaseFontSizePx: number,
  renderDirection: RenderTextDirection,
): React.CSSProperties {
  const scale = resolveInlineScale(block, renderedBaseFontSizePx);
  const outlineWidth = resolveRunOutlineWidth(
    block,
    run,
    renderedBaseFontSizePx,
    scale,
  );
  return {
    color: run.color ?? resolveEffectiveTextColor(block),
    backgroundColor: run.backgroundColor,
    WebkitTextStrokeColor:
      outlineWidth > 0
        ? (run.outlineColor ?? resolveEffectiveTextOutlineColor(block))
        : "transparent",
    WebkitTextStrokeWidth: `${outlineWidth * 2}px`,
    paintOrder: "stroke fill",
    ...resolveTextEmphasisStyle(block, run, renderDirection),
    textShadow: resolveRunGlow(block, run, scale),
  } as React.CSSProperties;
}

/**
 * Contenteditable selections in Chromium can drop `-webkit-text-stroke`
 * while retaining spellcheck decorations, making dark glyphs look deleted.
 * The editor uses an equivalent shadow outline so selection and IME painting
 * never own the only visible copy of a glyph. Artwork/export paths keep the
 * exact stroke renderer above.
 */
export function resolveEditorRunVisualStyle(
  block: TranslationBlock,
  run: TextStyleRun,
  renderedBaseFontSizePx: number,
  renderDirection: RenderTextDirection,
): React.CSSProperties {
  const main = resolveMainRunVisualStyle(
    block,
    run,
    renderedBaseFontSizePx,
    renderDirection,
  );
  const scale = resolveInlineScale(block, renderedBaseFontSizePx);
  const outlineWidth = resolveRunOutlineWidth(
    block,
    run,
    renderedBaseFontSizePx,
    scale,
  );
  const outlineColor =
    run.outlineColor ?? resolveEffectiveTextOutlineColor(block);
  const outlineShadow = createEditorOutlineShadow(outlineWidth, outlineColor);
  const glow = typeof main.textShadow === "string" ? main.textShadow : "";
  return {
    ...main,
    // Editing-only backing for a run that would vanish on the field tone.
    // Run datasets and the artwork/export renderer keep the real background.
    backgroundColor:
      main.backgroundColor ??
      resolveEditorRunBackdrop(
        block,
        String(main.color),
        outlineWidth,
        outlineColor,
      ),
    WebkitTextStrokeColor: "transparent",
    WebkitTextStrokeWidth: "0px",
    textShadow:
      [
        outlineShadow,
        glow,
        resolveRunShadowCss(block, run, renderedBaseFontSizePx),
      ]
        .filter(Boolean)
        .join(", ") || undefined,
  };
}

function resolveEditorRunBackdrop(
  block: TranslationBlock,
  ink: string,
  outlineWidth: number,
  outlineColor: string,
): string | undefined {
  const surface = EDITOR_SURFACE_COLORS[resolveEditorSurfaceTone(block)];
  const readable = (color: string): boolean =>
    resolveTextOutlineContrastRatio(color, surface) >=
    MIN_AUTOMATIC_TEXT_OUTLINE_CONTRAST_RATIO;
  if (readable(ink) || (outlineWidth > 0 && readable(outlineColor))) {
    return undefined;
  }
  return resolveAutomaticTextOutlineColor({ textColor: ink });
}

function createEditorOutlineShadow(width: number, color: string): string {
  const radius = Math.min(EDITOR_OUTLINE_PREVIEW_MAX_PX, Math.max(0, width));
  if (radius === 0) return "";
  const shadows: string[] = [];
  const ringCount = Math.max(1, Math.ceil(radius));
  for (let ring = 1; ring <= ringCount; ring += 1) {
    const distance = (radius * ring) / ringCount;
    for (let step = 0; step < 8; step += 1) {
      const angle = (Math.PI * step) / 4;
      const x = roundShadowOffset(Math.cos(angle) * distance);
      const y = roundShadowOffset(Math.sin(angle) * distance);
      shadows.push(`${x}px ${y}px 0 ${color}`);
    }
  }
  return shadows.join(", ");
}

function roundShadowOffset(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveRunOutlineWidth(
  block: TranslationBlock,
  run: TextStyleRun,
  renderedBaseFontSizePx: number,
  scale: number,
): number {
  return run.outlineWidthPx === undefined
    ? resolveEffectiveTextOutlineWidthPx(block, renderedBaseFontSizePx)
    : run.outlineWidthPx * scale;
}

export function resolveRunTextDecorationStyle(
  block: TranslationBlock,
  run: TextStyleRun,
): React.CSSProperties | null {
  const decorations = resolveRunTextDecorations(block, run);
  const lines = [
    decorations.underline ? "underline" : "",
    decorations.strikethrough ? "line-through" : "",
  ]
    .filter(Boolean)
    .join(" ");
  if (!lines) return null;
  return {
    textDecorationLine: lines,
    textDecorationColor: run.color ?? resolveEffectiveTextColor(block),
    textDecorationThickness: "0.08em",
    textUnderlineOffset: "0.12em",
    // Chromium applies -webkit-text-stroke to decoration lines as well as
    // glyphs. Reset it on the decoration owner; a nested glyph span restores
    // the intended outline without turning the decoration into outline color.
    WebkitTextStrokeWidth: "0px",
  };
}

function resolveTextEmphasisStyle(
  block: TranslationBlock,
  run: TextStyleRun,
  renderDirection: RenderTextDirection,
): React.CSSProperties {
  if (!block.emphasisMark && !run.emphasisMark) return {};
  return {
    textEmphasisStyle: "filled dot",
    textEmphasisColor: "currentColor",
    textEmphasisPosition:
      renderDirection === "vertical" ? "over right" : "over",
  } as React.CSSProperties;
}

/** Reserve the same advance that layout measures, and scale the ink independently. */
export function resolveRunWidthGeometry(
  text: string,
  widthScale: number,
  font: { size: number; family: string; weight: number; italic: boolean },
  direction: RenderTextDirection = "horizontal",
  letterSpacing = 0,
): { container: React.CSSProperties; glyph: React.CSSProperties } {
  const context = getTextMeasureContext();
  context.font = `${font.italic ? "italic " : ""}${font.weight} ${font.size}px ${font.family}`;
  const width =
    direction === "vertical" ? font.size : context.measureText(text).width;
  return {
    container: {
      display: "inline-block",
      width: `${width * widthScale}px`,
      ...(direction === "horizontal" && letterSpacing !== 0
        ? { marginRight: `${letterSpacing}px` }
        : {}),
    },
    glyph: {
      display: "inline-block",
      transform: `scaleX(${widthScale})`,
      transformOrigin: "left center",
      whiteSpace: "pre",
      letterSpacing: "normal",
    },
  };
}

export function resolveOuterRunVisualStyle(
  block: TranslationBlock,
  run: TextStyleRun,
  renderedBaseFontSizePx: number,
): React.CSSProperties | null {
  const scale = resolveInlineScale(block, renderedBaseFontSizePx);
  const innerWidth =
    run.outlineWidthPx === undefined
      ? resolveEffectiveTextOutlineWidthPx(block, renderedBaseFontSizePx)
      : run.outlineWidthPx * scale;
  const outerWidth =
    run.outerOutlineWidthPx === undefined
      ? Math.max(0, block.outerOutlineWidthPx ?? 0)
      : run.outerOutlineWidthPx * scale;
  if (outerWidth <= 0) return null;
  const color =
    run.outerOutlineColor ??
    block.outerOutlineColor ??
    DEFAULT_OUTER_OUTLINE_COLOR;
  return {
    color: "transparent",
    WebkitTextFillColor: "transparent",
    WebkitTextStrokeColor: color,
    WebkitTextStrokeWidth: `${(innerWidth + outerWidth) * 2}px`,
    paintOrder: "stroke fill",
  } as React.CSSProperties;
}

export function hasAnyOuterOutline(
  block: TranslationBlock,
  runs: readonly TextStyleRun[],
): boolean {
  return (
    Math.max(0, block.outerOutlineWidthPx ?? 0) > 0 ||
    runs.some((run) => Math.max(0, run.outerOutlineWidthPx ?? 0) > 0)
  );
}

export function resolveRunGlow(
  block: TranslationBlock,
  run: Omit<TextStyleRun, "text">,
  scale: number,
): string | undefined {
  const hasInlineGlow =
    run.glowColor !== undefined ||
    run.glowBlurPx !== undefined ||
    run.glowOpacity !== undefined;
  if (!hasInlineGlow) return resolveTextGlowCssShadow(block.textGlow, scale);
  const base = resolveTextGlow(block.textGlow);
  return resolveTextGlowCssShadow(
    {
      enabled: true,
      color: run.glowColor ?? base.color,
      blurPx: run.glowBlurPx ?? base.blurPx,
      opacity: run.glowOpacity ?? base.opacity,
    },
    scale,
  );
}

function resolveInlineScale(
  block: TranslationBlock,
  renderedBaseFontSizePx: number,
): number {
  return renderedBaseFontSizePx / Math.max(1, block.fontSizePx || 1);
}

/** A separate plane paints selected-character shadows before every outline/ink plane. */
export function resolveRunShadowCss(
  block: TranslationBlock,
  run: Omit<TextStyleRun, "text">,
  renderedBaseFontSizePx: number,
): string | undefined {
  const scale = resolveInlineScale(block, renderedBaseFontSizePx);
  const effect = resolveRunTextEffect(block, run);
  return resolveTextEffectCssShadow(effect, { x: scale, y: scale });
}
