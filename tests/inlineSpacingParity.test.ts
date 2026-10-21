import { describe, expect, it } from "vitest";
import {
  applyTextStyleToRuns,
  parseRichText,
  serializeRichTextRuns,
} from "../src/shared/richTextMarkup";
import { resolveOutputLineRanges } from "../src/renderer/src/lib/inlineLineMetrics";
import { measureStyledWrappedText } from "../src/renderer/src/lib/overlayTextWrapping";

import { measureStyledWrappedTextInSlots } from "../src/renderer/src/lib/bubbleTextWrapping";
import { applyInlineLineMetrics } from "../src/renderer/src/lib/inlineLineMetrics";

const context = {
  font: "",
  measureText: () => ({ width: 10 }) as TextMetrics,
};

describe("inline spacing legacy characterization", () => {
  it("preserves explicit empty lines, soft wraps, and consumed whitespace", () => {
    const result = measureStyledWrappedText(
      context,
      parseRichText("가나\n\n다라마 바").runs,
      30,
      12,
      10,
      "sans-serif",
      0,
      "break-all",
      undefined,
      true,
    );
    expect(
      result.lines.map((line) => ({
        text: line.runs.map((run) => run.text).join(""),
        width: line.width,
        consumed: line.sourceTextLength,
      })),
    ).toEqual([
      { text: "가나", width: 20, consumed: undefined },
      { text: "", width: 0, consumed: undefined },
      { text: "다라마", width: 30, consumed: 4 },
      { text: "바", width: 10, consumed: undefined },
    ]);
    expect(result.totalHeight).toBe(48);
  });

  it("retains legacy maximum-font line height and run boundaries", () => {
    const runs = parseRichText("가[size=20]나[/size]\n다").runs;
    const result = measureStyledWrappedText(
      context,
      runs,
      100,
      12,
      10,
      "sans-serif",
      0,
      "normal",
      (run) => ({
        fontSizePx: run.sizePx ?? 10,
        fontFamily: "sans-serif",
        opacity: 1,
      }),
    );
    expect(result.totalHeight).toBe(48);
    expect(result.lines.map((line) => line.width)).toEqual([20, 10]);
    expect(serializeRichTextRuns(runs)).toBe("가[size=20]나[/size]\n다");
  });
});

describe("character leading and tracking", () => {
  it("keeps a styled blank line when flowing through shape slots", () => {
    const measured = measureStyledWrappedTextInSlots(
      context,
      parseRichText("a\n[line-height=2]\n[/line-height]b").runs,
      [0, 12, 24].map((blockOffsetPx) => ({
        blockOffsetPx,
        inlineOffsetPx: 0,
        availableWidth: 100,
        regionIndex: 0,
      })),
      12,
      10,
      "sans-serif",
      0,
      "break-all",
    );
    expect(measured.consumedAll).toBe(true);
    expect(applyInlineLineMetrics(measured.lines, 12, 10)).toBe(44);
    expect(measured.lines[1].leadingOffsetPx).toBe(8);
  });

  const measure = (text: string, width = 100) =>
    measureStyledWrappedText(
      context,
      parseRichText(text).runs,
      width,
      12,
      10,
      "sans-serif",
      0,
      "break-all",
    );
  it("changes only the distance into the selected line, with reversible tightening", () => {
    const expanded = measure("가나\n[line-height=2]다라[/line-height]\n마바");
    expect(expanded.lines.map((line) => line.leadingOffsetPx)).toEqual([
      0, 8, 0,
    ]);
    expect(expanded.totalHeight).toBe(44);
    const tight = measure("가나\n[line-height=0.8]다라[/line-height]\n마바");
    expect(tight.lines.map((line) => line.leadingOffsetPx)).toEqual([0, -4, 0]);
    expect(tight.totalHeight).toBe(32);
  });
  it("retains leading on an explicit empty line and exposes its selectable terminator", () => {
    const result = measure("가\n[line-height=2]\n[/line-height]나");
    expect(result.totalHeight).toBe(44);
    expect(result.lines.map((line) => line.leadingOffsetPx)).toEqual([0, 8, 0]);
    expect(resolveOutputLineRanges(result.lines, "가\n\n나")[1]).toEqual({
      start: 2,
      end: 3,
    });
  });
  it("uses the largest effective value, without extending a character selection", () => {
    expect(measure("가\n[line-height=0.8]다[/line-height]라").totalHeight).toBe(
      24,
    );
    expect(measure("[line-height=4]가[/line-height]\n나").totalHeight).toBe(24);
  });
  it("follows characters across soft wraps and maps actual output lines to source", () => {
    const text = "가나\n\n다라마 바";
    const measured = measure(text, 30);
    expect(resolveOutputLineRanges(measured.lines, text)).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 4 },
      { start: 4, end: 7 },
      { start: 7, end: 9 },
    ]);
    const emoji = measure("가😀\r\n나", 100);
    expect(resolveOutputLineRanges(emoji.lines, "가😀\r\n나")).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 6 },
    ]);
  });
  it("measures per-character tracking at style boundaries and preserves markup", () => {
    const source = "[letter-spacing=0.5]가[/letter-spacing]나다";
    expect(measure(source).maxLineWidth).toBe(35);
    expect(measure(source, 30).lines.map((line) => line.width)).toEqual([
      25, 10,
    ]);
    const runs = applyTextStyleToRuns(parseRichText(source).runs, 1, 2, {
      lineHeight: 2,
    });
    expect(parseRichText(serializeRichTextRuns(runs)).runs).toEqual(runs);
    expect(parseRichText(serializeRichTextRuns(runs)).plainText).toBe("가나다");
  });
});

it("preserves leading on a whitespace-only line even when visible trailing spaces are trimmed", () => {
  const result = measureStyledWrappedText(
    context,
    parseRichText("가\n[line-height=2]  [/line-height]\n나").runs,
    100,
    12,
    10,
    "sans-serif",
    0,
    "break-all",
    undefined,
    true,
  );
  expect(result.lines.map((line) => line.leadingOffsetPx)).toEqual([0, 8, 0]);
  expect(result.totalHeight).toBe(44);
  expect(resolveOutputLineRanges(result.lines, "가\n  \n나")[1]).toEqual({
    start: 2,
    end: 4,
  });
});
