import { expect, it } from "vitest";
import { joinCropOcrTexts } from "../src/main/pipeline/keepBlocksOcr";
it("joins crop OCR texts in Japanese reading order and skips junk hints", () => {
  const joined = joinCropOcrTexts(
    [
      { x1: 10, y1: 10, x2: 40, y2: 200, ocrText: "ばかり" },
      { x1: 100, y1: 10, x2: 130, y2: 200, ocrText: "その" },
      { x1: 55, y1: 10, x2: 85, y2: 200, ocrText: "女" },
      { x1: 55, y1: 10, x2: 85, y2: 200, ocrText: "   " },
      { ocrText: "좌표없음" },
      null,
    ],
    "ja",
  );
  expect(joined).toBe("その 女 ばかり");
});

it("preserves non-Japanese text in automatic mode", () => {
  expect(
    joinCropOcrTexts(
      [{ x1: 10, y1: 10, x2: 80, y2: 40, ocrText: "Hello" }],
      "auto",
    ),
  ).toBe("Hello");
});

it("orders explicit Japanese fragments within one column from top to bottom", () => {
  expect(
    joinCropOcrTexts(
      [
        { x1: 10, y1: 70, x2: 40, y2: 100, ocrText: "後" },
        { x1: 10, y1: 10, x2: 40, y2: 40, ocrText: "先" },
      ],
      "ja",
    ),
  ).toBe("先 後");
});
