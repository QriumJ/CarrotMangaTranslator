import { describe, expect, it } from "vitest";
import type { WorkStyleGuide } from "../src/shared/workContextTypes";
import {
  WORK_GLOSSARY_FILE_FORMAT,
  buildWorkGlossaryFile,
  parseWorkGlossaryFile,
  serializeWorkGlossaryFile,
} from "../src/shared/workGlossaryFile";

const stamp = "2026-10-20T00:00:00.000Z";

function guide(): WorkStyleGuide {
  return {
    schemaVersion: 1,
    workId: "11111111-1111-4111-8111-111111111111",
    glossary: [
      {
        id: "g1",
        source: "魔導院",
        target: "마도원",
        category: "place",
        aliases: ["まどういん"],
        note: "학교 이름",
        origin: "ai",
        enabled: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
      {
        id: "g2",
        source: "ﾁｪｲﾝ",
        target: "",
        category: "term",
        aliases: [],
        note: "",
        enabled: false,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    characters: [
      {
        id: "c1",
        displayName: "아리스",
        sourceNames: ["アリス"],
        targetName: "아리스",
        speechStyle: "polite",
        enabled: true,
        createdAt: stamp,
        updatedAt: stamp,
      },
    ],
    rules: {
      prompt: "",
      honorifics: "adapt",
      sfxMode: "translate",
      defaultTone: "natural_korean",
    },
    createdAt: stamp,
    updatedAt: stamp,
  };
}

describe("work glossary file", () => {
  it("round-trips terms and characters without native IDs or timestamps", () => {
    const text = serializeWorkGlossaryFile(
      buildWorkGlossaryFile(guide(), "마도원 이야기", stamp),
    );
    const raw = JSON.parse(text) as Record<string, unknown>;
    expect(raw.format).toBe(WORK_GLOSSARY_FILE_FORMAT);
    expect(text).not.toContain('"id"');
    expect(text).not.toContain("createdAt");
    const parsed = parseWorkGlossaryFile(text);
    expect(parsed).toEqual({
      ok: true,
      file: {
        workTitle: "마도원 이야기",
        invalidCount: 0,
        glossary: [
          {
            source: "魔導院",
            target: "마도원",
            category: "place",
            aliases: ["まどういん"],
            note: "학교 이름",
            origin: "ai",
            enabled: true,
          },
          // An intentionally blank translation and a disabled flag survive.
          { source: "ﾁｪｲﾝ", target: "", category: "term", enabled: false },
        ],
        characters: [
          {
            displayName: "아리스",
            sourceNames: ["アリス"],
            targetName: "아리스",
            speechStyle: "polite",
            enabled: true,
          },
        ],
      },
    });
  });

  it("reads a raw style-guide.json and a nested context export", () => {
    const raw = JSON.stringify(guide());
    const nested = JSON.stringify({ format: "other", guide: guide() });
    for (const text of [raw, `\uFEFF${raw}`, nested]) {
      const parsed = parseWorkGlossaryFile(text);
      expect(parsed.ok && parsed.file.glossary.length).toBe(2);
      expect(parsed.ok && parsed.file.characters.length).toBe(1);
    }
  });

  it("counts unreadable entries instead of guessing their values", () => {
    const parsed = parseWorkGlossaryFile(
      JSON.stringify({
        glossary: [
          { source: "", target: "x" },
          { source: "  ", target: "x" },
          "not an entry",
          { source: "竜", target: "용", category: "unknown-kind" },
        ],
        characters: [{ speechStyle: "polite" }],
      }),
    );
    expect(parsed).toEqual({
      ok: true,
      file: {
        invalidCount: 4,
        characters: [],
        glossary: [
          { source: "竜", target: "용", category: "term", enabled: true },
        ],
      },
    });
  });

  it.each([
    ["{not json", "invalid-json", 0],
    ["[]", "unrecognized", 0],
    ['{"title":"x"}', "unrecognized", 0],
    [
      JSON.stringify({ format: WORK_GLOSSARY_FILE_FORMAT, version: 2 }),
      "unsupported-version",
      0,
    ],
    ['{"glossary":[],"characters":[]}', "empty", 0],
    ['{"glossary":[{"target":"x"}]}', "empty", 1],
  ])("rejects %s as %s", (text, error, invalidCount) => {
    expect(parseWorkGlossaryFile(text)).toEqual({
      ok: false,
      error,
      invalidCount,
    });
  });
});
