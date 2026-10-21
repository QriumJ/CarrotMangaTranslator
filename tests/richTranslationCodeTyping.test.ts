import { describe, expect, it } from "vitest";
import {
  applyCodeTypingStyle,
  applyRichTranslationCodeStyle,
  serializeCodeSelection,
} from "../src/renderer/src/components/richTranslationCodeFormatting";
import { parseRichText } from "../src/shared/richTextMarkup";

describe("explicit code-mode character formatting", () => {
  it("inserts only new text with pending shadow and allows a later local disable", () => {
    const typed = applyCodeTypingStyle("ab", "a한b", {
      shadowEnabled: true,
      shadowOffsetXpx: -3,
    });
    const parsed = parseRichText(typed?.value ?? "");
    expect(
      parsed.runs.map((run) => [
        run.text,
        run.shadowEnabled,
        run.shadowOffsetXpx,
      ]),
    ).toEqual([
      ["a", undefined, undefined],
      ["한", true, -3],
      ["b", undefined, undefined],
    ]);
    const selection = serializeCodeSelection(parsed.runs, { start: 1, end: 2 });
    const off = applyRichTranslationCodeStyle(
      selection.value,
      { start: selection.selectionStart, end: selection.selectionEnd },
      { shadowEnabled: false },
    );
    expect(parseRichText(off?.value ?? "").runs[1]).toMatchObject({
      text: "한",
      shadowEnabled: false,
      shadowOffsetXpx: -3,
    });
  });
  it("keeps markup offsets valid across multiple runs and private-use characters", () => {
    const result = serializeCodeSelection(
      [
        { text: "a\ue000", bold: true, italic: false },
        { text: "bc", bold: false, italic: true },
      ],
      { start: 1, end: 3 },
    );
    const next = applyRichTranslationCodeStyle(
      result.value,
      { start: result.selectionStart, end: result.selectionEnd },
      { color: "#123456" },
    );
    const parsed = parseRichText(next?.value ?? "");
    expect(parsed.plainText).toBe("a\ue000bc");
    expect(
      parsed.runs
        .filter((run) => run.color)
        .map((run) => run.text)
        .join(""),
    ).toBe("\ue000b");
  });
  it("does not format deletion or an empty caret as inserted text", () => {
    expect(applyCodeTypingStyle("abc", "ac", { bold: true })).toBeNull();
    expect(applyCodeTypingStyle("a", "ab", null)).toBeNull();
    expect(
      applyRichTranslationCodeStyle("ab", { start: 1, end: 1 }, { bold: true }),
    ).toBeNull();
  });

  it("styles only newly typed visible text and leaves adjacent characters intact", () => {
    const result = applyCodeTypingStyle("ab", "a한b", {
      lineHeight: 2,
      letterSpacing: 0.2,
    });
    const parsed = parseRichText(result?.value ?? "");
    expect(parsed.plainText).toBe("a한b");
    expect(
      parsed.runs.map((run) => [run.text, run.lineHeight, run.letterSpacing]),
    ).toEqual([
      ["a", undefined, undefined],
      ["한", 2, 0.2],
      ["b", undefined, undefined],
    ]);
    expect(applyCodeTypingStyle("ab", "ab", { lineHeight: 2 })).toBeNull();
  });
  it("does not turn bold on when the pending value is explicitly false", () => {
    const result = applyCodeTypingStyle("ab", "a한b", { bold: false });
    expect(
      parseRichText(result?.value ?? "a한b").runs.every((run) => !run.bold),
    ).toBe(true);
  });
  it("setting bold on an already-bold selected word is idempotent", () => {
    const result = applyRichTranslationCodeStyle(
      "**ab**",
      { start: 2, end: 4 },
      { bold: true },
    );
    const parsed = parseRichText(result?.value ?? "**ab**");
    expect(parsed.plainText).toBe("ab");
    expect(parsed.runs.every((run) => run.bold)).toBe(true);
  });
});
