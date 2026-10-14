import { expect, it } from "vitest";
import { validateSoundEffectTranslationResponse } from "../src/main/jobs/soundEffectTranslationResult";
import type { SoundEffectReviewRegion } from "../src/shared/soundEffectReview";
it("accepts confirmed Latin effects and Japanese target text without a Japanese-only source gate", () => {
  const regions = [{ id: "FX001" }] as SoundEffectReviewRegion[];
  for (const [confirmedSource, translation, targetLanguage] of [
    ["BOOM", "쾅", "ko"],
    ["쾅", "ドン", "ja"],
  ]) {
    const result = validateSoundEffectTranslationResponse(
      {
        items: [
          {
            regionId: "FX001",
            verdict: "sound",
            confirmedSource,
            translation,
            confidence: 0.9,
          },
        ],
      },
      regions,
      targetLanguage,
    );
    expect(result.valid).toHaveLength(1);
    expect(result.retryRegionIds).toEqual([]);
  }
});

it("retains source-script validation when the user explicitly selects Japanese", () => {
  const result = validateSoundEffectTranslationResponse(
    {
      items: [
        {
          regionId: "FX001",
          verdict: "sound",
          confirmedSource: "BOOM",
          translation: "쾅",
          confidence: 0.9,
        },
      ],
    },
    [{ id: "FX001" }] as SoundEffectReviewRegion[],
    "ko",
    "ja",
  );
  expect(result.valid).toEqual([]);
  expect(result.retryRegionIds).toEqual(["FX001"]);
});
