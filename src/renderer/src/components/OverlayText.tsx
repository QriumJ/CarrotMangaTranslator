import { hasInlineTextShadow } from "../../../shared/richTextShadow";
import styles from "./OverlayText.module.css";
import type { PanelTextSelection } from "../../../shared/panelBridgeTypes";
import { resolveOutputLineRanges } from "../lib/inlineLineMetrics";
import React from "react";
import type {
  RenderTextDirection,
  TranslationBlock,
} from "../../../shared/textTypes";
import { parseRichText } from "../../../shared/richTextMarkup";
import type { BlockFontCatalog } from "../lib/fonts";
import type { BlockTextLayout } from "../lib/overlayLayout";
import type { BlockTextLine } from "../lib/textLineTypes";
import {
  createTextRunStyleResolver,
  type TextRunStyleResolver,
} from "../lib/textStyleRunResolution";
import { hasAnyOuterOutline } from "../lib/textRunVisualStyles";
import { renderTextRun } from "./OverlayTextRun";
import {
  resolveFixedLineStyle,
  resolveOverlayTextContentStyle,
  resolveOverlayTextWrapStyle,
} from "./overlayTextStyles";

export function OverlayText({
  textSelection,
  block,
  displayText,
  fontCatalog,
  layout,
  renderDirection,
}: {
  textSelection?: PanelTextSelection | null;
  block: TranslationBlock;
  displayText: string;
  fontCatalog: BlockFontCatalog;
  layout: BlockTextLayout;
  renderDirection: RenderTextDirection;
}): React.JSX.Element {
  const parsed = parseRichText(
    displayText,
    Boolean(block.bold),
    Boolean(block.italic),
    block.fontWeight,
  );
  const blockOpacityAtRoot = !parsed.runs.some(
    (run) => run.opacity !== undefined,
  );
  const resolveRunStyle = createTextRunStyleResolver(
    block,
    layout.fontSizePx,
    fontCatalog,
  );
  const hasOuterOutline = hasAnyOuterOutline(block, parsed.runs);
  return (
    <>
      {[
        ...(parsed.runs.some(hasInlineTextShadow) ? ["shadow" as const] : []),
        ...(hasOuterOutline ? ["outer" as const] : []),
      ].map((layer) => (
        <OverlayTextLayer
          key={layer}
          block={block}
          blockOpacityAtRoot={blockOpacityAtRoot}
          fontCatalog={fontCatalog}
          layout={layout}
          renderDirection={renderDirection}
          resolveRunStyle={resolveRunStyle}
          runs={parsed.runs}
          layer={layer}
        />
      ))}
      <OverlayTextLayer
        block={block}
        blockOpacityAtRoot={blockOpacityAtRoot}
        fontCatalog={fontCatalog}
        layout={layout}
        renderDirection={renderDirection}
        resolveRunStyle={resolveRunStyle}
        runs={parsed.runs}
        layer="outline"
      />
      <OverlayTextLayer
        block={block}
        blockOpacityAtRoot={blockOpacityAtRoot}
        fontCatalog={fontCatalog}
        layout={layout}
        renderDirection={renderDirection}
        resolveRunStyle={resolveRunStyle}
        runs={parsed.runs}
        textSelection={
          displayText === block.translatedText ? textSelection : null
        }
        layer="main"
      />
    </>
  );
}

function OverlayTextLayer({
  textSelection,
  block,
  blockOpacityAtRoot,
  fontCatalog,
  layout,
  layer,
  renderDirection,
  resolveRunStyle,
  runs,
}: {
  textSelection?: PanelTextSelection | null;
  block: TranslationBlock;
  blockOpacityAtRoot: boolean;
  fontCatalog: BlockFontCatalog;
  layout: BlockTextLayout;
  layer: "main" | "outline" | "outer" | "shadow";
  renderDirection: RenderTextDirection;
  resolveRunStyle: TextRunStyleResolver;
  runs: ReturnType<typeof parseRichText>["runs"];
}): React.JSX.Element {
  return (
    <div
      aria-hidden={layer !== "main" || undefined}
      className={`overlay-text overlay-text-${layer}`}
      style={resolveOverlayTextWrapStyle(
        block,
        layout,
        fontCatalog,
        blockOpacityAtRoot,
      )}
    >
      <span
        className="overlay-text-content"
        style={resolveOverlayTextContentStyle(block, layout, renderDirection)}
      >
        {layout.lines
          ? renderFixedLines(
              block,
              layout,
              layout.lines,
              renderDirection,
              resolveRunStyle,
              blockOpacityAtRoot,
              layer,
              textSelection,
            )
          : renderParsedTextRuns(
              block,
              runs,
              renderDirection,
              resolveRunStyle,
              blockOpacityAtRoot,
              layout.fontSizePx,
              layer,
            )}
      </span>
    </div>
  );
}

function renderParsedTextRuns(
  block: TranslationBlock,
  runs: ReturnType<typeof parseRichText>["runs"],
  renderDirection: RenderTextDirection,
  resolveRunStyle: TextRunStyleResolver,
  blockOpacityAtRoot: boolean,
  renderedBaseFontSizePx: number,
  layer: "main" | "outline" | "outer" | "shadow",
): React.ReactNode {
  return runs.map((run, index) =>
    renderTextRun(
      run,
      index,
      renderDirection,
      resolveRunStyle,
      blockOpacityAtRoot,
      block,
      renderedBaseFontSizePx,
      layer,
    ),
  );
}

function renderFixedLines(
  block: TranslationBlock,
  layout: BlockTextLayout,
  lines: BlockTextLine[],
  renderDirection: RenderTextDirection,
  resolveRunStyle: TextRunStyleResolver,
  blockOpacityAtRoot: boolean,
  layer: "main" | "outline" | "outer" | "shadow",
  textSelection?: PanelTextSelection | null,
): React.ReactNode {
  const ranges = textSelection
    ? resolveOutputLineRanges(
        lines,
        parseRichText(textSelection.translatedText).plainText,
      )
    : [];
  const columnFontSizePx = lines.reduce(
    (largest, line) =>
      line.runs.reduce(
        (maximum, run) =>
          Math.max(maximum, run.renderedFontSizePx ?? layout.fontSizePx),
        largest,
      ),
    layout.fontSizePx,
  );
  return lines.map((line, lineIndex) => (
    <span
      className={`overlay-text-line ${styles.line}`}
      data-text-selection={
        layer === "main" &&
        textSelection &&
        ranges[lineIndex]?.start < textSelection.end &&
        ranges[lineIndex]?.end > textSelection.start
          ? ""
          : undefined
      }
      data-bubble-direction={line.slot ? renderDirection : undefined}
      data-bubble-slot={line.slot ? "" : undefined}
      key={lineIndex}
      style={resolveFixedLineStyle(
        line,
        block,
        layout.fontSizePx,
        renderDirection,
        columnFontSizePx,
      )}
    >
      {line.runs.length > 0
        ? line.runs.map((run, runIndex) =>
            renderTextRun(
              run,
              runIndex,
              renderDirection,
              resolveRunStyle,
              blockOpacityAtRoot,
              block,
              layout.fontSizePx,
              layer,
            ),
          )
        : "\u00a0"}
    </span>
  ));
}
