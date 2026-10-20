import { describe, expect, it } from "vitest";
import { MAX_GLOSSARY_ENTRIES } from "../src/shared/ipcSchemaPrimitives";
import type {
  CharacterProfile,
  GlossaryEntry,
  WorkStyleGuide,
} from "../src/shared/workContextTypes";
import type { ParsedWorkGlossaryFile } from "../src/shared/workGlossaryFile";
import {
  applyWorkGlossaryImport,
  planWorkGlossaryImport,
} from "../src/shared/workGlossaryImportPlan";

const old = "2026-01-01T00:00:00.000Z";
const now = "2026-10-20T00:00:00.000Z";

function entry(
  id: string,
  source: string,
  target: string,
  extra: Partial<GlossaryEntry> = {},
): GlossaryEntry {
  return {
    id,
    source,
    target,
    category: "term",
    aliases: [],
    note: "",
    origin: "ai",
    enabled: true,
    createdAt: old,
    updatedAt: old,
    ...extra,
  };
}

function character(
  id: string,
  sourceNames: string[],
  targetName: string,
): CharacterProfile {
  return {
    id,
    displayName: targetName,
    sourceNames,
    targetName,
    speechStyle: "neutral",
    enabled: true,
    createdAt: old,
    updatedAt: old,
  };
}

function guideWith(
  glossary: GlossaryEntry[],
  characters: CharacterProfile[] = [],
): WorkStyleGuide {
  return {
    schemaVersion: 1,
    workId: "11111111-1111-4111-8111-111111111111",
    glossary,
    characters,
    rules: {
      prompt: "keep",
      honorifics: "adapt",
      sfxMode: "translate",
      defaultTone: "natural_korean",
    },
    createdAt: old,
    updatedAt: old,
  };
}

function file(
  glossary: ParsedWorkGlossaryFile["glossary"],
  characters: ParsedWorkGlossaryFile["characters"] = [],
): ParsedWorkGlossaryFile {
  return { glossary, characters, invalidCount: 2 };
}

const ids = () => {
  let next = 0;
  return (prefix: string) => `${prefix}-new-${++next}`;
};

describe("work glossary import plan", () => {
  const current = guideWith(
    [
      entry("g1", "魔導院", "마도원", { aliases: ["学院"] }),
      entry("g2", "竜騎士", "용기사"),
    ],
    [character("c1", ["アリス"], "앨리스")],
  );
  const imported = file(
    [
      // Same name with full-width/case/space differences and same content.
      { source: " 竜騎士 ", target: "용기사", category: "term", enabled: true },
      {
        source: "魔導院",
        target: "마도 학원",
        category: "place",
        aliases: ["まどういん"],
        enabled: true,
      },
      { source: "聖剣", target: "성검", category: "term", enabled: true },
      {
        source: "聖剣",
        target: "성스러운 검",
        category: "term",
        enabled: true,
      },
    ],
    [
      {
        displayName: "アリス",
        sourceNames: ["アリス", "ありす"],
        targetName: "아리스",
        speechStyle: "neutral",
        enabled: true,
      },
      {
        displayName: "ボブ",
        sourceNames: ["ボブ"],
        targetName: "밥",
        speechStyle: "rough",
        enabled: true,
      },
    ],
  );

  it("classifies new, unchanged, conflicting and repeated entries", () => {
    const plan = planWorkGlossaryImport(current, imported);
    expect(plan.glossary.added.map((item) => item.source)).toEqual(["聖剣"]);
    expect(plan.glossary.unchanged).toBe(1);
    expect(plan.glossary.repeatedInFile).toBe(1);
    expect(plan.glossary.conflicts.map((item) => item.existing.id)).toEqual([
      "g1",
    ]);
    expect(plan.characters.added.map((item) => item.targetName)).toEqual([
      "밥",
    ]);
    expect(plan.characters.conflicts.map((item) => item.existing.id)).toEqual([
      "c1",
    ]);
    expect(plan.invalidCount).toBe(2);
  });

  it("keeps every existing entry unchanged by default and only appends", () => {
    const plan = planWorkGlossaryImport(current, imported);
    const result = applyWorkGlossaryImport(current, plan, "keep-existing", {
      now,
      createId: ids(),
    });
    expect(result.replaced).toBe(0);
    expect(result.added).toBe(2);
    expect(result.guide.glossary.slice(0, 2)).toEqual(current.glossary);
    expect(result.guide.characters[0]).toEqual(current.characters[0]);
    expect(result.guide.glossary[2]).toMatchObject({
      id: "glossary-new-1",
      source: "聖剣",
      target: "성검",
      origin: "manual",
      createdAt: now,
    });
    expect(result.guide.rules).toEqual(current.rules);
  });

  it("replaces conflicts in place when asked, keeping IDs and merging names", () => {
    const plan = planWorkGlossaryImport(current, imported);
    const result = applyWorkGlossaryImport(current, plan, "use-imported", {
      now,
      createId: ids(),
    });
    expect(result.replaced).toBe(2);
    expect(result.guide.glossary).toHaveLength(3);
    expect(result.guide.glossary[0]).toMatchObject({
      id: "g1",
      source: "魔導院",
      target: "마도 학원",
      category: "place",
      aliases: ["学院", "まどういん"],
      origin: "manual",
      createdAt: old,
      updatedAt: now,
    });
    expect(result.guide.glossary[1]).toEqual(current.glossary[1]);
    expect(result.guide.characters[0]).toMatchObject({
      id: "c1",
      targetName: "아리스",
      sourceNames: ["アリス", "ありす"],
    });
  });

  it("matches names regardless of width, case and spacing", () => {
    const plan = planWorkGlossaryImport(
      guideWith([entry("g1", "ＡＢＣ  Ｓword", "검")]),
      file([
        { source: "abc sword", target: "검", category: "term", enabled: true },
      ]),
    );
    expect(plan.glossary.unchanged).toBe(1);
    expect(plan.glossary.added).toEqual([]);
  });

  it("never exceeds the stored entry limit and reports the remainder", () => {
    const full = guideWith(
      Array.from({ length: MAX_GLOSSARY_ENTRIES - 1 }, (_, index) =>
        entry(`g${index}`, `語${index}`, `말${index}`),
      ),
    );
    const plan = planWorkGlossaryImport(
      full,
      file([
        { source: "新A", target: "a", category: "term", enabled: true },
        { source: "新B", target: "b", category: "term", enabled: true },
        { source: "新C", target: "c", category: "term", enabled: true },
      ]),
    );
    expect(plan.glossary.added.map((item) => item.source)).toEqual(["新A"]);
    expect(plan.glossary.overLimit).toBe(2);
    const result = applyWorkGlossaryImport(full, plan, "keep-existing", {
      now,
      createId: ids(),
    });
    expect(result.guide.glossary).toHaveLength(MAX_GLOSSARY_ENTRIES);
  });
});
