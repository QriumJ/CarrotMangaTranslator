import { describe, expect, it } from "vitest";
import { buildPromptWorkContextForPage } from "../src/main/pipeline/workContextPrompt";
import type {
  ChapterStoryMemory,
  WorkStyleGuide,
} from "../src/shared/workContextTypes";

const promptRuntime =
  require("../src/main/runtime/simple-page-prompts.cjs") as {
    getOverlayPrompt: (
      options?: Record<string, unknown>,
      imageVariants?: Array<Record<string, unknown>>,
    ) => string;
  };

const fixedRuntime =
  require("../src/main/runtime/semantic-ocr/fixed-block-translation.cjs") as {
    buildFixedBlockTranslationPrompt: (
      plan: Record<string, unknown>,
      options: Record<string, unknown>,
    ) => string;
  };
const soundRuntime =
  require("../src/main/runtime/semantic-ocr/sound-effect-translation.cjs") as {
    buildSoundEffectTranslationPrompt: (
      options: Record<string, unknown>,
    ) => string;
  };

describe("prompt work context", () => {
  it.each(["ko", "en"])(
    "preserves authored language names and multiline text in every translation prompt for %s",
    (targetLanguage) => {
      const guide = makeStyleGuide();
      guide.rules.prompt =
        'Preserve Korean nicknames.\nUse "Japanese" literally in this title.\n\n♡ 유지';
      guide.characters[0].speechStyle = "custom";
      guide.characters[0].customSpeechStyle =
        "Use Korean honorifics.\nJapanese words remain Japanese.";
      const options = {
        sourceLanguage: "ja",
        targetLanguage,
        collectPageContext: false,
        workContext: { styleGuide: guide, storyMemory: makeStoryMemory() },
      };
      const prompts = [
        promptRuntime.getOverlayPrompt(options),
        promptRuntime.getOverlayPrompt({ ...options, regionCropMode: true }),
        fixedRuntime.buildFixedBlockTranslationPrompt(
          {
            version: 6,
            blocks: [
              {
                blockId: "B001",
                jp: "ありがとう",
                direction: "vertical",
                bbox: { x1: 10, y1: 20, x2: 80, y2: 180 },
              },
            ],
          },
          options,
        ),
        soundRuntime.buildSoundEffectTranslationPrompt({
          ...options,
          soundEffectTranslationRegions: [
            {
              regionId: "sfx-1",
              recognizedText: "ドン",
              bbox: { x: 0, y: 0, w: 100, h: 100 },
            },
          ],
        }),
      ];
      for (const prompt of prompts) {
        expect(prompt).toContain(JSON.stringify(guide.rules.prompt));
        expect(prompt).toContain(
          JSON.stringify(guide.characters[0].customSpeechStyle),
        );
      }
    },
  );
  it.each([false, true])(
    "includes full work instructions and voices with cumulative mode %s",
    (collectPageContext) => {
      const guide = makeStyleGuide();
      const voice =
        "상대가 왕이면 문장 끝에 전하를 붙인다.\n".repeat(25) +
        "말투의 마지막 규칙";
      guide.rules.prompt = "문장 끝 마침표는 생략한다.\n♡와 ♪는 유지한다.";
      guide.characters = Array.from({ length: 45 }, (_, index) => ({
        ...guide.characters[0],
        id: `voice-${index}`,
        enabled: true,
        displayName: `등장인물${index}`,
        speechStyle: "custom",
        customSpeechStyle: voice,
      }));
      const context = buildPromptWorkContextForPage({
        baseStyleGuide: guide,
        storyMemory: makeStoryMemory(),
        pageId: "page-4",
        pageIndex: 4,
      });
      const prompt = promptRuntime.getOverlayPrompt({
        workContext: context,
        collectPageContext,
      });
      expect(prompt).toContain(JSON.stringify(guide.rules.prompt));
      expect(prompt).toContain(JSON.stringify(voice));
      expect(prompt).toContain("등장인물44");
      expect(prompt).not.toContain("Rules: honorifics=");
      guide.rules.prompt = "";
      const emptyPrompt = promptRuntime.getOverlayPrompt({
        workContext: { ...context, styleGuide: guide },
        collectPageContext,
      });
      expect(emptyPrompt).not.toContain("Rules: honorifics=");
      expect(emptyPrompt).not.toContain("Work translation instructions");
    },
  );
  it("injects enabled glossary and recent story memory without changing output schema", () => {
    const context = buildPromptWorkContextForPage({
      baseStyleGuide: makeStyleGuide(),
      storyMemory: makeStoryMemory(),
      pageId: "page-4",
      pageIndex: 4,
      recentPageCount: 2,
    });
    const prompt = promptRuntime.getOverlayPrompt(
      {
        imageWidth: 1000,
        imageHeight: 1400,
        workContext: context,
      },
      [{ role: "original", dataUrl: "data:image/png;base64,abc" }],
    );

    expect(prompt).toContain("# Work glossary and story memory");
    expect(prompt).toContain("魔王 => 마왕");
    expect(prompt).toContain("勇者");
    expect(prompt).not.toContain("비활성");
    expect(prompt).toContain("p3");
    expect(prompt).toContain("p4");
    expect(prompt).not.toContain("p1");
    expect(prompt).toContain("Do not output these notes as records.");
    expect(prompt).toContain(
      "Use exactly these keys, one per line: id, type, textRole, x1, y1, x2, y2, direction, angle, fontSize, confidence, jp, ko.",
    );
  });

  it("explains active omission rules and removes them from OCR prompt copies", () => {
    const context = buildPromptWorkContextForPage({
      baseStyleGuide: makeStyleGuide(),
      storyMemory: makeStoryMemory(),
      pageId: "page-4",
      pageIndex: 4,
      recentPageCount: 2,
    });
    const prompt = promptRuntime.getOverlayPrompt(
      {
        imageWidth: 1000,
        imageHeight: 1400,
        sourceLanguage: "ja",
        targetLanguage: "ko",
        workContext: context,
        glossaryOmissionTerms: ["。", "．"],
        ocrBboxHints: [
          {
            id: 1,
            label: "ocr_textline",
            x1: 10,
            y1: 20,
            x2: 200,
            y2: 80,
            ocrText: "こんにちは。",
          },
        ],
      },
      [{ role: "original", dataUrl: "data:image/png;base64,abc" }],
    );

    expect(prompt).toContain("Exact omission rules");
    expect(prompt).toContain("- omit exactly: 。");
    expect(prompt).not.toContain("。 =>");
    expect(prompt).toContain('ocrText:"こんにちは"');
    expect(prompt).not.toContain('ocrText:"こんにちは。"');
  });
});

function makeStyleGuide(): WorkStyleGuide {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    schemaVersion: 1,
    workId: "work-a",
    glossary: [
      {
        id: "glossary-1",
        source: "魔王",
        target: "마왕",
        category: "term",
        aliases: ["魔王様"],
        note: "칭호",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "glossary-2",
        source: "無効",
        target: "비활성",
        category: "term",
        enabled: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "glossary-omit",
        source: "。",
        target: "",
        category: "term",
        aliases: ["．"],
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    characters: [
      {
        id: "character-1",
        displayName: "勇者",
        sourceNames: ["勇者"],
        targetName: "용사",
        speechStyle: "casual",
        enabled: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    rules: {
      honorifics: "adapt",
      sfxMode: "translate",
      defaultTone: "natural_korean",
    },
    createdAt: now,
    updatedAt: now,
  };
}

function makeStoryMemory(): ChapterStoryMemory {
  return {
    schemaVersion: 1,
    workId: "work-a",
    chapterId: "chapter-a",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pages: [0, 2, 3].map((pageIndex) => ({
      pageId: `page-${pageIndex}`,
      pageName: `${pageIndex + 1}.png`,
      pageIndex,
      sourceDigest: `source ${pageIndex}`,
      translatedDigest: `translated ${pageIndex}`,
      summary: `summary ${pageIndex}`,
      updatedAt: "2026-01-01T00:00:00.000Z",
    })),
  };
}
