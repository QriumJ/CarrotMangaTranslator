import type { TextStyleRun } from "../../../shared/richTextMarkup";
export type RenderedTextStyleRun = TextStyleRun & {
  renderedFontSizePx?: number;
  renderedFontFamily?: string;
  renderedOpacity?: number;
};

export type BlockTextLine = {
  runs: RenderedTextStyleRun[];
  width: number;
  /** Formatting of an empty line terminator or omitted whitespace. */
  leadingRuns?: RenderedTextStyleRun[];
  /** Consumed source characters, including whitespace omitted at a soft wrap. */
  sourceTextLength?: number;
  slot?: TextLineSlot;
  lineBoxHeightPx?: number;
  leadingOffsetPx?: number;
};

export type TextLineSlot = {
  /** Block-axis position: line top for horizontal, column left for vertical. */
  blockOffsetPx: number;
  /** Inline-axis position: line left for horizontal, column top for vertical. */
  inlineOffsetPx: number;
  /** Inline-axis room available after any applicable font-width scaling. */
  availableWidth: number;
  regionIndex: number;
};

export type WrappedTextMeasurement = {
  lines: BlockTextLine[];
  lineCount: number;
  totalHeight: number;
  maxLineWidth: number;
};
