import { expect, it } from "vitest";

const { findFixedBlockTargetLanguageViolations } =
  require("../src/main/runtime/semantic-ocr/fixed-block-quality.cjs") as {
    findFixedBlockTargetLanguageViolations: (
      items: { blockId: string; ko: string }[],
      options: { sourceLanguage?: string; targetLanguage: string },
    ) => { blockId: string; ko: string }[];
  };

it.each([
  ["ko", "待って", "기다려"],
  ["en", "기다려", "WAIT"],
  ["ja", "기다려", "待って"],
  ["zh-Hans", "待って", "等待"],
  ["ar", "待って", "مرحبا"],
  ["uk", "待って", "Привіт"],
])(
  "auto still validates scripts for target %s",
  (targetLanguage, leaked, valid) => {
    const items = [
      { blockId: "bad", ko: leaked },
      { blockId: "good", ko: valid },
      { blockId: "name", ko: "Alice 7" },
    ];
    for (const sourceLanguage of ["auto", undefined])
      expect(
        findFixedBlockTargetLanguageViolations(items, {
          sourceLanguage,
          targetLanguage,
        }),
      ).toEqual([items[0]]);
  },
);
