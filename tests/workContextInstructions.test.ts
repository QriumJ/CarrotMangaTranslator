import { describe, expect, it } from "vitest";
import {
  applyWorkInstructions,
  captureWorkInstructions,
  characterVoiceText,
  migrateWorkContextInstructions,
} from "../src/shared/workContextInstructions";
import type { WorkStyleGuide } from "../src/shared/workContextTypes";
import { WorkStyleGuideSchema } from "../src/shared/ipcWorkContextSchemas";
import { buildPromptWorkContextForPage } from "../src/main/pipeline/workContextPrompt";

function legacyGuide(): WorkStyleGuide {
  const timestamp = "2026-01-01T00:00:00.000Z";
  return {
    schemaVersion: 1,
    workId: "work-1",
    createdAt: timestamp,
    updatedAt: timestamp,
    glossary: [],
    rules: { honorifics: "preserve", sfxMode: "note", defaultTone: "literal" },
    characters: [
      {
        id: "hero",
        displayName: "유나",
        targetName: "유나",
        sourceNames: ["ユナ"],
        speechStyle: "polite",
        customSpeechStyle: "친구에게는 반말을 쓴다.",
        enabled: true,
        origin: "manual",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  };
}

describe("work instructions compatibility", () => {
  it("preserves legacy rules and custom voice without repeating migration", () => {
    const original = legacyGuide();
    const migrated = migrateWorkContextInstructions(original);
    expect(migrated.rules.prompt).toBe(
      "원문의 호칭과 경칭을 유지한다.\n효과음은 의미를 설명하는 형태로 옮긴다.\n원문의 표현과 의미를 살려 직역에 가깝게 번역한다.",
    );
    expect(migrated.characters[0]).toMatchObject({
      speechStyle: "custom",
      customSpeechStyle: "정중한 존댓말을 사용한다.\n친구에게는 반말을 쓴다.",
    });
    expect(migrateWorkContextInstructions(migrated)).toEqual(migrated);
    expect(original.characters[0].speechStyle).toBe("polite");
    expect(original.rules.prompt).toBeUndefined();
  });

  it("preserves long legacy text and treats an explicit empty prompt as authoritative", () => {
    const guide = legacyGuide();
    guide.rules.prompt = "";
    guide.characters[0].customSpeechStyle = "가".repeat(1000);
    const migrated = WorkStyleGuideSchema.parse(
      migrateWorkContextInstructions(guide),
    );
    expect(migrated.rules.prompt).toBe("");
    expect(migrated.characters[0].customSpeechStyle).toContain(
      "가".repeat(1000),
    );
    expect(characterVoiceText({ speechStyle: "neutral" })).toBe("");
  });

  it("restores execution instructions without overwriting current defaults or losing cumulative new characters", () => {
    const guide = migrateWorkContextInstructions(legacyGuide());
    guide.rules.prompt = "실행 당시 지침";
    const snapshot = captureWorkInstructions(guide);
    const latest = structuredClone(guide);
    latest.rules.prompt = "이후 작품 지침";
    latest.characters = [
      { ...latest.characters[0], id: "new-hero", displayName: "새 인물" },
    ];
    const context = buildPromptWorkContextForPage({
      baseStyleGuide: latest,
      instructions: snapshot,
      pageId: "page-1",
      pageIndex: 0,
      storyMemory: {
        schemaVersion: 1,
        workId: guide.workId,
        chapterId: "chapter-1",
        pages: [],
        updatedAt: guide.updatedAt,
      },
    });
    expect(context.styleGuide.rules.prompt).toBe("실행 당시 지침");
    expect(
      context.styleGuide.characters.map((character) => character.id),
    ).toEqual(["hero", "new-hero"]);
    expect(latest.rules.prompt).toBe("이후 작품 지침");
    expect(latest.characters.map((character) => character.id)).toEqual([
      "new-hero",
    ]);
    expect(() =>
      applyWorkInstructions({ ...latest, workId: "other" }, snapshot),
    ).toThrow(/작품/);
  });
});
