import {
  applyTextStyleToRuns,
  parseRichText,
  serializeRichTextRuns,
  type TextStylePatch,
  type TextStyleRun,
} from "../../../shared/richTextMarkup";
import type { InlineMarkupResult } from "../lib/textareaMarkup";
import type { RichTextEditorSelection } from "../lib/richTextEditorDom";
import { resolveRichTranslationCodeSelection } from "./richTranslationSelectionModel";

/** Code and visual editing use the same explicit style assignment semantics. */
export function applyRichTranslationCodeStyle(
  value: string,
  selection: RichTextEditorSelection,
  patch: TextStylePatch,
): InlineMarkupResult | null {
  const parsed = parseRichText(value);
  const range = resolveRichTranslationCodeSelection(
    value,
    selection,
    parsed.plainText.length,
  );
  if (range.start === range.end) return null;
  return serializeCodeSelection(
    applyTextStyleToRuns(parsed.runs, range.start, range.end, patch),
    range,
  );
}

/** Keep a logical selection through canonical safe-markup serialization. */
export function serializeCodeSelection(
  runs: readonly TextStyleRun[],
  selection: RichTextEditorSelection,
): InlineMarkupResult {
  const plain = runs.map((run) => run.text).join("");
  let marker = "\ue000";
  while (plain.includes(marker)) marker += "\ue000";
  const endMarker = marker + "\ue001";
  let offset = 0;
  const marked = runs.map((run) => {
    const start = offset;
    offset += run.text.length;
    let text = run.text;
    for (const [position, token] of [
      [selection.end, endMarker],
      [selection.start, marker],
    ] as const) {
      if (
        position >= start &&
        (position < offset || (offset === plain.length && position === offset))
      ) {
        text =
          text.slice(0, position - start) +
          token +
          text.slice(position - start);
      }
    }
    return { ...run, text };
  });
  const raw = serializeRichTextRuns(marked);
  const from = raw.indexOf(marker);
  const to = raw.indexOf(endMarker);
  return {
    value: raw.replace(endMarker, "").replace(marker, ""),
    selectionStart: Math.max(0, from),
    selectionEnd: Math.max(0, to - marker.length),
  };
}

export function applyCodeTypingStyle(
  previous: string,
  next: string,
  patch: TextStylePatch | null,
): InlineMarkupResult | null {
  if (!patch || previous === next) return null;
  let start = 0;
  while (
    start < previous.length &&
    start < next.length &&
    previous[start] === next[start]
  )
    start++;
  let suffix = 0;
  while (
    suffix < previous.length - start &&
    suffix < next.length - start &&
    previous[previous.length - suffix - 1] === next[next.length - suffix - 1]
  )
    suffix++;
  const end = next.length - suffix;
  if (start >= end) return null;
  const result = applyRichTranslationCodeStyle(next, { start, end }, patch);
  return result ? { ...result, selectionStart: result.selectionEnd } : null;
}
