import type { BlockTextLine } from "./textLineTypes";

/** Keep the legacy line box; leading changes the distance into the next line. */
export function applyInlineLineMetrics(
  lines: BlockTextLine[],
  lineHeightPx: number,
  fontSizePx: number,
): number {
  if (
    !lines.some((line) =>
      (line.leadingRuns ?? line.runs).some(
        (run) => run.lineHeight !== undefined,
      ),
    )
  )
    return lines.length * lineHeightPx;
  let total = lineHeightPx;
  for (const [index, line] of lines.entries()) {
    const runs = line.leadingRuns ?? line.runs;
    const advance = runs.length
      ? Math.max(
          ...runs.map((run) =>
            run.lineHeight === undefined
              ? lineHeightPx
              : run.lineHeight * (run.renderedFontSizePx ?? fontSizePx),
          ),
        )
      : lineHeightPx;
    line.lineBoxHeightPx = lineHeightPx;
    line.leadingOffsetPx = index === 0 ? 0 : advance - lineHeightPx;
    if (index > 0) total += advance;
  }
  return lines.length ? total : 0;
}

/** Source offsets use UTF-16, as do the DOM selection and safe markup editor. */
export function resolveOutputLineRanges(
  lines: readonly BlockTextLine[],
  plainText: string,
): Array<{ start: number; end: number }> {
  let offset = 0;
  return lines.map((line) => {
    const start = offset;
    const consumed =
      line.sourceTextLength ??
      line.runs.reduce((sum, run) => sum + run.text.length, 0);
    // Measurements normalize CRLF; map back to the actual editable source.
    let remaining = consumed;
    while (remaining > 0 && offset < plainText.length) {
      if (plainText.slice(offset, offset + 2) === "\r\n") offset++;
      offset++;
      remaining--;
    }
    let end = offset;
    if (end === start && plainText[offset] === "\n") end++;
    if (end === start && plainText.slice(offset, offset + 2) === "\r\n")
      end += 2;
    if (plainText[offset] === "\r") offset++;
    if (plainText[offset] === "\n") offset++;
    return { start, end };
  });
}
