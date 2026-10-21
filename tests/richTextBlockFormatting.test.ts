import { describe, expect, it } from "vitest";
import {
  applyBlockCharacterFormat,
  applySelectionCharacterFormat,
  clearChangedCharacterOverrides,
} from "../src/shared/richTextBlockFormatting";
import {
  parseRichText,
  serializeRichTextRuns,
} from "../src/shared/richTextMarkup";
import { makeBlock } from "./helpers/workspacePointerFixtures";

const source = "[size=40][color=#ff0000]**가**[/color][/size]나";
describe("frame and selection character formatting", () => {
  it("unifies only size and leaves color and emphasis intact across persistence", () => {
    const block = makeBlock(false, {
      translatedText: source,
      autoFitText: true,
    });
    const patch = applyBlockCharacterFormat(block, { sizePx: 24 });
    expect(patch).toMatchObject({
      fontSizePx: 24,
      autoFitText: false,
      fontSizeIntent: "manual",
    });
    const restored = JSON.parse(JSON.stringify({ ...block, ...patch }));
    const runs = parseRichText(restored.translatedText).runs;
    expect(runs.every((run) => run.sizePx === undefined)).toBe(true);
    expect(runs[0]).toMatchObject({ color: "#ff0000", bold: true, text: "가" });
    expect(parseRichText(restored.translatedText).plainText).toBe("가나");
    expect(block.translatedText).toBe(source);
  });
  it("clears direct tracking overrides while preserving independent leading", () => {
    const block = makeBlock(false, {
      translatedText:
        "[line-height=2][letter-spacing=0.3]가[/letter-spacing][/line-height]나",
    });
    const patch = clearChangedCharacterOverrides(block, { letterSpacing: 0 });
    expect(patch.letterSpacing).toBe(0);
    expect(parseRichText(patch.translatedText ?? "").runs[0]).toMatchObject({
      lineHeight: 2,
    });
    expect(
      parseRichText(patch.translatedText ?? "").runs.every(
        (run) => run.letterSpacing === undefined,
      ),
    ).toBe(true);
    expect(
      clearChangedCharacterOverrides(block, { textAlign: "left" }),
    ).toEqual({ textAlign: "left" });
  });
  it("turns inherited bold off locally without changing other characters", () => {
    const block = makeBlock(false, { translatedText: "가나다", bold: true });
    const result = applySelectionCharacterFormat(
      block,
      parseRichText(block.translatedText).runs,
      1,
      2,
      { bold: false, lineHeight: 2 },
    );
    expect(result.blockPatch).toEqual({ bold: false });
    const saved = parseRichText(serializeRichTextRuns(result.runs)).runs;
    expect(saved.map((run) => [run.text, run.bold, run.lineHeight])).toEqual([
      ["가", true, undefined],
      ["나", false, 2],
      ["다", true, undefined],
    ]);
  });
  it("keeps original source and unrelated block fields when formatting all characters", () => {
    const block = makeBlock(false, { translatedText: source });
    const patch = applyBlockCharacterFormat(block, { color: "#0000ff" });
    expect(patch.textColor).toBe("#0000ff");
    expect(patch.sourceText).toBeUndefined();
    expect(parseRichText(patch.translatedText ?? "").runs[0]).toMatchObject({
      sizePx: 40,
      bold: true,
    });
    expect(
      parseRichText(patch.translatedText ?? "").runs.every(
        (run) => run.color === undefined,
      ),
    ).toBe(true);
  });
});

it("treats undefined character patch fields as untouched", () => {
  const block = makeBlock(false, { translatedText: "[size=40]가[/size]" });
  const patch = applyBlockCharacterFormat(block, {
    sizePx: undefined,
    color: "#ff0000",
  });
  expect(patch.fontSizePx).toBeUndefined();
  expect(patch.autoFitText).toBeUndefined();
  expect(parseRichText(patch.translatedText ?? "").runs[0].sizePx).toBe(40);
});
