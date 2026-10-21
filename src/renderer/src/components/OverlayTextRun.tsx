import React from "react";
import type {
  RenderTextDirection,
  TranslationBlock,
} from "../../../shared/textTypes";
import { resolveFontWeight } from "../../../shared/blockFontWeight";
import type { BlockTextLine } from "../lib/textLineTypes";
import type { TextRunStyleResolver } from "../lib/textStyleRunResolution";
import {
  resolveRunShadowCss,
  resolveMainRunVisualStyle,
  resolveOuterRunVisualStyle,
  resolveRunTextDecorationStyle,
  resolveRunWidthGeometry,
} from "../lib/textRunVisualStyles";
import { segmentGraphemes } from "../lib/overlayTextSegmentation";
import { segmentVerticalTextGraphemes } from "../lib/verticalTextSpacing";
import { TextWithVerticalSpacing } from "./VerticalTextSpacing";
export function renderTextRun(
  run: BlockTextLine["runs"][number],
  key: React.Key,
  renderDirection: RenderTextDirection,
  resolveRunStyle: TextRunStyleResolver,
  blockOpacityAtRoot: boolean,
  block: TranslationBlock,
  renderedBaseFontSizePx: number,
  layer: "main" | "outline" | "outer" | "shadow",
): React.JSX.Element | null {
  const fallback = resolveRunStyle(run);
  let visualStyle =
    layer === "outer"
      ? resolveOuterRunVisualStyle(block, run, renderedBaseFontSizePx)
      : resolveMainRunVisualStyle(
          block,
          run,
          renderedBaseFontSizePx,
          renderDirection,
        );
  if (!visualStyle) return null;
  if (layer === "shadow") {
    visualStyle = {
      ...visualStyle,
      WebkitTextStrokeWidth: "0px",
      textShadow: resolveRunShadowCss(block, run, renderedBaseFontSizePx),
      backgroundColor: undefined,
    };
  }
  visualStyle = textPlaneStyle(visualStyle, layer);
  const baseStyle = resolveTextRunBaseStyle(run, fallback, blockOpacityAtRoot);
  const content = (
    <TextWithVerticalSpacing
      bold={run.bold}
      direction={renderDirection}
      text={run.text}
      spacing={resolveRunVerticalSpacing(
        run,
        block,
        fallback.fontSizePx,
        renderDirection,
      )}
    />
  );
  const decorationStyle =
    layer === "main" ? resolveRunTextDecorationStyle(block, run) : null;
  if ((run.widthScale ?? 1) !== 1) {
    return renderWidthScaledRun(
      run,
      key,
      renderDirection,
      baseStyle,
      visualStyle,
      decorationStyle,
      run.letterSpacing ?? block.letterSpacing ?? 0,
      block.lineHeight,
    );
  }
  if (decorationStyle) {
    return (
      <span key={key} style={{ ...baseStyle, ...decorationStyle }}>
        <span style={visualStyle}>{content}</span>
      </span>
    );
  }
  return (
    <span
      key={key}
      style={{
        ...baseStyle,
        ...visualStyle,
      }}
    >
      {content}
    </span>
  );
}

function resolveTextRunBaseStyle(
  run: BlockTextLine["runs"][number],
  fallback: ReturnType<TextRunStyleResolver>,
  blockOpacityAtRoot: boolean,
): React.CSSProperties {
  return {
    ...(run.letterSpacing === undefined
      ? {}
      : { letterSpacing: `${run.letterSpacing}em` }),
    fontWeight: resolveFontWeight(run),
    fontStyle: run.italic ? "italic" : "normal",
    fontSize: `${run.renderedFontSizePx ?? fallback.fontSizePx}px`,
    fontFamily: run.renderedFontFamily ?? fallback.fontFamily,
    opacity: blockOpacityAtRoot ? 1 : (run.renderedOpacity ?? fallback.opacity),
  };
}

function renderWidthScaledRun(
  run: BlockTextLine["runs"][number],
  key: React.Key,
  renderDirection: RenderTextDirection,
  baseStyle: React.CSSProperties,
  visualStyle: React.CSSProperties,
  decorationStyle: React.CSSProperties | null,
  letterSpacing: number,
  lineHeight: number,
): React.JSX.Element {
  const segments =
    renderDirection === "vertical"
      ? segmentVerticalTextGraphemes(run.text)
      : segmentGraphemes(run.text);
  return (
    <span key={key} style={baseStyle}>
      {segments.map((text, index) => {
        if (text === "\n") return <br key={index} />;
        const geometry = resolveRunWidthGeometry(
          text,
          run.widthScale ?? 1,
          {
            size: Number.parseFloat(String(baseStyle.fontSize)),
            family: String(baseStyle.fontFamily),
            weight: resolveFontWeight(run),
            italic: run.italic,
          },
          renderDirection,
          letterSpacing * Number.parseFloat(String(baseStyle.fontSize)),
        );
        return (
          <span
            key={index}
            style={{ ...geometry.container, ...decorationStyle }}
          >
            <span style={{ ...visualStyle, ...geometry.glyph }}>
              <TextWithVerticalSpacing
                bold={run.bold}
                direction={renderDirection}
                text={text}
                spacing={
                  renderDirection === "vertical"
                    ? {
                        fontSizePx: Number.parseFloat(
                          String(baseStyle.fontSize),
                        ),
                        lineHeight,
                        letterSpacingEm: letterSpacing,
                      }
                    : undefined
                }
              />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function textPlaneStyle(
  visualStyle: React.CSSProperties,
  layer: "main" | "outline" | "outer" | "shadow",
): React.CSSProperties {
  // Paint the whole outline plane before any ink; adjacent lines must never erase it.
  const outlineColor = visualStyle.WebkitTextStrokeColor;
  const outlineWidth =
    Number.parseFloat(String(visualStyle.WebkitTextStrokeWidth)) / 2;
  return {
    ...visualStyle,
    ...(layer === "main"
      ? {
          WebkitTextStrokeWidth: "0px",
          textShadow: "none",
          backgroundColor: undefined,
        }
      : { color: "transparent", WebkitTextFillColor: "transparent" }),
    "--mgt-vertical-symbol-outline-color":
      layer === "main" ? "transparent" : outlineColor,
    "--mgt-vertical-symbol-outline-width": `${layer === "main" ? 0 : outlineWidth}px`,
  } as React.CSSProperties & Record<`--${string}`, string | undefined>;
}

function resolveRunVerticalSpacing(
  run: BlockTextLine["runs"][number],
  block: TranslationBlock,
  fallbackFontSize: number,
  direction: RenderTextDirection,
) {
  return direction === "vertical"
    ? {
        fontSizePx: run.renderedFontSizePx ?? fallbackFontSize,
        lineHeight: block.lineHeight,
        letterSpacingEm: run.letterSpacing ?? block.letterSpacing ?? 0,
      }
    : undefined;
}
