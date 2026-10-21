/** @vitest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resolveBlockTextLayout } from "../src/renderer/src/lib/overlayLayout";
import { DEFAULT_BLOCK_FONT_CATALOG } from "../src/renderer/src/lib/fonts";
import { makeBlock } from "./helpers/workspacePointerFixtures";

import { resolveBubbleWrappedText } from "../src/renderer/src/lib/bubbleBlockTextLayout";
import { createTextRunStyleResolver } from "../src/renderer/src/lib/textStyleRunResolution";

import * as inlineSlots from "../src/renderer/src/lib/inlineBubbleLineSlots";

const original = HTMLCanvasElement.prototype.getContext;
beforeAll(() =>
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => ({ font: "", measureText: () => ({ width: 10 }) }),
  }),
);
afterAll(() =>
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: original,
  }),
);
const size = { width: 1000, height: 1000 };
describe("canonical inline spacing layout", () => {
  it("fails closed if reflow never settles instead of hanging the editor", () => {
    let calls = 0;
    const unstableGeometry = vi
      .spyOn(inlineSlots, "resolveInlineBubbleSlots")
      .mockImplementation((_lines, slots) =>
        slots.map((slot) => ({
          ...slot,
          blockOffsetPx: slot.blockOffsetPx + (++calls % 2 ? 1 : 2),
        })),
      );
    try {
      const block = makeBlock(true, {
        translatedText: "[line-height=2]a[/line-height]",
        fontSizePx: 10,
        autoFitText: false,
        fontSizeIntent: "manual",
      });
      expect(
        resolveBubbleWrappedText(
          block,
          block.translatedText,
          10,
          100,
          30,
          DEFAULT_BLOCK_FONT_CATALOG,
        ),
      ).toBeNull();
      expect(calls).toBeGreaterThan(1);
      expect(calls).toBeLessThan(100);
    } finally {
      unstableGeometry.mockRestore();
    }
  });

  it("rejects partial leading that moves lines outside the permitted shape", () => {
    const block = makeBlock(true, {
      translatedText: "a\n[line-height=4]b[/line-height]\nc",
      fontSizePx: 10,
      lineHeight: 1,
      autoFitText: false,
      fontSizeIntent: "manual",
    });
    expect(
      resolveBubbleWrappedText(
        block,
        block.translatedText,
        10,
        100,
        30,
        DEFAULT_BLOCK_FONT_CATALOG,
      ),
    ).toBeNull();
  });
  it("resolves inherited font metrics separately from inline tracking and opacity", () => {
    const resolver = createTextRunStyleResolver(
      makeBlock(false, {
        fontSizePx: 0,
        textOpacity: 0.5,
      }),
      10,
      DEFAULT_BLOCK_FONT_CATALOG,
    );
    expect(
      resolver({
        text: "a",
        bold: false,
        italic: false,
        letterSpacing: 0.25,
        opacity: 0.7,
      }),
    ).toMatchObject({
      fontSizePx: 10,
      letterSpacingEm: 0.25,
      opacity: 0.7,
    });
    expect(resolver({ text: "b", bold: false, italic: false })).toMatchObject({
      fontSizePx: 10,
      opacity: 0.5,
    });
    expect(
      resolver({ text: "b", bold: false, italic: false }).letterSpacingEm,
    ).toBeUndefined();
  });

  it.each(["horizontal", "vertical"] as const)(
    "keeps the three-line example's second gap in %s",
    (direction) => {
      const block = makeBlock(false, {
        renderDirection: direction,
        translatedText:
          "그래도 난..\n[line-height=2]널 믿을 수[/line-height]\n있잖아?",
        fontSizePx: 10,
        lineHeight: 1.2,
        autoFitText: false,
        fontSizeIntent: "manual",
        bbox: { x: 0, y: 0, w: 200, h: 200 },
        wordBreak: "break-all",
      });
      const result = resolveBlockTextLayout(
        block,
        block.translatedText,
        size,
        size,
        DEFAULT_BLOCK_FONT_CATALOG,
      );
      expect(result.lines?.map((line) => line.leadingOffsetPx)).toEqual([
        0, 8, 0,
      ]);
      expect(
        result.lines?.map((line) => line.runs.map((run) => run.text).join("")),
      ).toEqual(["그래도 난..", "널 믿을 수", "있잖아?"]);
    },
  );
  it.each(["horizontal", "vertical"] as const)(
    "uses measured variable slots in a %s shape",
    (direction) => {
      const block = makeBlock(true, {
        renderDirection: direction,
        translatedText: "가\n[line-height=2]나[/line-height]\n다",
        fontSizePx: 10,
        lineHeight: 1.2,
        autoFitText: false,
        fontSizeIntent: "manual",
        renderBbox: { x: 0, y: 0, w: 200, h: 200 },
      });
      if (!block.bubbleLayout) throw new Error("Missing fixture shape");
      block.bubbleLayout.direction = direction;
      const result = resolveBlockTextLayout(
        block,
        block.translatedText,
        size,
        size,
        DEFAULT_BLOCK_FONT_CATALOG,
      );
      const offsets = result.lines?.map((line) => line.slot?.blockOffsetPx);
      expect(offsets).toHaveLength(3);
      if (!offsets || offsets.some((value) => value === undefined))
        throw new Error("Expected actual shape slots");
      expect(Math.abs(Number(offsets[1]) - Number(offsets[0]))).toBeCloseTo(20);
      expect(Math.abs(Number(offsets[2]) - Number(offsets[1]))).toBeCloseTo(12);
    },
  );
});
