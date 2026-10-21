import { describe, expect, it } from "vitest";
import { resolveInlineBubbleSlots } from "../src/renderer/src/lib/inlineBubbleLineSlots";
import { measureStyledWrappedText } from "../src/renderer/src/lib/overlayTextWrapping";
import { parseRichText } from "../src/shared/richTextMarkup";
import { makeBlock } from "./helpers/workspacePointerFixtures";
import type { TextLineSlot } from "../src/renderer/src/lib/textLineTypes";

const context = { font: "", measureText: () => ({ width: 10 }) as TextMetrics };
function lines() {
  return measureStyledWrappedText(
    context,
    parseRichText("가\n[line-height=2]나[/line-height]\n다").runs,
    100,
    12,
    10,
    "sans-serif",
    0,
    "break-all",
  ).lines;
}
function slots(offsets: number[]): TextLineSlot[] {
  return offsets.map((blockOffsetPx) => ({
    blockOffsetPx,
    inlineOffsetPx: 0,
    availableWidth: 100,
    regionIndex: 0,
  }));
}
describe("variable leading in shaped text", () => {
  it("centers text while only changing the incoming gap", () => {
    const result = resolveInlineBubbleSlots(
      lines(),
      slots([32, 44, 56]),
      makeBlock(true).bubbleLayout,
      12,
      10,
      100,
      100,
      1,
      "horizontal",
    );
    if (!result) throw new Error("Expected fitted horizontal lines");
    expect(result.map((slot) => slot.blockOffsetPx)).toEqual([28, 48, 60]);
    expect(result.every((slot) => slot.availableWidth === 100)).toBe(true);
  });
  it("applies the same incoming distance to right-to-left vertical columns", () => {
    const result = resolveInlineBubbleSlots(
      lines(),
      slots([56, 44, 32]),
      makeBlock(true).bubbleLayout,
      12,
      10,
      100,
      100,
      1,
      "vertical",
    );
    if (!result) throw new Error("Expected fitted vertical lines");
    expect(result.map((slot) => slot.blockOffsetPx)).toEqual([60, 40, 28]);
  });
  it("re-intersects moved bands and rejects unavailable space", () => {
    const layout = makeBlock(true).bubbleLayout;
    if (!layout) throw new Error("Expected shape fixture");
    layout.regions[0].spans = [
      { blockStart: 0.32, blockEnd: 0.68, inlineStart: 0, inlineEnd: 1 },
    ];
    expect(
      resolveInlineBubbleSlots(
        lines(),
        slots([32, 44, 56]),
        layout,
        12,
        10,
        100,
        100,
        1,
        "horizontal",
      ),
    ).toBeNull();
    expect(
      resolveInlineBubbleSlots(
        lines(),
        slots([32, 44, 56]),
        null,
        12,
        10,
        100,
        100,
        1,
        "horizontal",
      ),
    ).toBeNull();
  });
});
