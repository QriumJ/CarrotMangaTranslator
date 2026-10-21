import { isCjkGrapheme } from "../../../shared/naturalTextLayoutSegmentation";
import {
  resolveNaturalWordBreakOffsets,
  segmentGraphemes,
} from "./overlayTextSegmentation";
import type { BlockTextLine } from "./textLineTypes";
export type WrappedTextQuality = {
  intraWordSplitCount: number;
  orphanLineCount: number;
  lineCount: number;
  semanticGraphemeCount: number;
  averageSemanticGraphemesPerLine: number;
};

/**
 * Measure rendered line damage without changing the text or wrapping policy.
 * Natural word boundaries and explicit source newlines are free; a boundary
 * inside a letter/number sequence is counted as an intra-word split.
 */
export function assessWrappedTextQuality(
  plainText: string,
  lines: readonly BlockTextLine[],
): WrappedTextQuality {
  const compact = compactExplicitNewlines(plainText.replace(/\r\n?/g, "\n"));
  const naturalBoundaries = resolveNaturalWordBreakOffsets(
    segmentGraphemes(compact.text).map((text) => ({ text })),
  );
  let textOffset = 0;
  let intraWordSplitCount = 0;
  let orphanLineCount = 0;
  let semanticGraphemeCount = 0;
  for (const [index, line] of lines.entries()) {
    const lineText = line.runs.map((run) => run.text).join("");
    textOffset += line.sourceTextLength ?? lineText.length;
    semanticGraphemeCount += countSemanticGraphemes(lineText);
    if (countContentGraphemes(lineText) === 1) {
      orphanLineCount += 1;
    }
    if (
      index < lines.length - 1 &&
      isDamagingWordBoundary(
        compact.text,
        textOffset,
        naturalBoundaries,
        compact.explicitBoundaries,
      )
    ) {
      intraWordSplitCount += 1;
    }
  }
  return {
    intraWordSplitCount,
    orphanLineCount,
    lineCount: lines.length,
    semanticGraphemeCount,
    averageSemanticGraphemesPerLine:
      semanticGraphemeCount / Math.max(1, lines.length),
  };
}

function compactExplicitNewlines(value: string): {
  text: string;
  explicitBoundaries: ReadonlySet<number>;
} {
  let text = "";
  const explicitBoundaries = new Set<number>();
  for (const grapheme of segmentGraphemes(value)) {
    if (grapheme === "\n") {
      explicitBoundaries.add(text.length);
    } else {
      text += grapheme;
    }
  }
  return { text, explicitBoundaries };
}

function isDamagingWordBoundary(
  text: string,
  offset: number,
  naturalBoundaries: ReadonlySet<number>,
  explicitBoundaries: ReadonlySet<number>,
): boolean {
  if (offset <= 0 || offset >= text.length || explicitBoundaries.has(offset)) {
    return false;
  }
  const previous = segmentGraphemes(text.slice(0, offset)).slice(-1).join("");
  const next = segmentGraphemes(text.slice(offset)).slice(0, 1).join("");
  if (
    naturalBoundaries.has(offset) &&
    !isCjkGrapheme(previous) &&
    !isCjkGrapheme(next)
  )
    return false;
  return isWordContent(previous) && isWordContent(next);
}

function countContentGraphemes(value: string): number {
  return segmentGraphemes(value).filter((grapheme) => !/^\s+$/u.test(grapheme))
    .length;
}

function countSemanticGraphemes(value: string): number {
  return segmentGraphemes(value).filter(isWordContent).length;
}

function isWordContent(value: string): boolean {
  return /[\p{Letter}\p{Number}\p{Mark}]/u.test(value);
}
