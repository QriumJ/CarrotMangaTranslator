import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  supportsChapterFontLanguagePair,
  supportsChapterFontSource,
} from "../src/shared/fontChapterSourcePolicy";
import { createFontChapterC18Port } from "../src/main/pipeline/fontChapterC18";
import type { AppPaths } from "../src/main/appPaths";
import type { TranslationOptions } from "../src/main/appSettings";
import type { FontChapterC18Page } from "../src/main/pipeline/fontChapterC18Types";
import { editingChapter } from "./mcpEditing.fixture";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

it.each(["auto", " AUTO ", undefined, "ja", "ja-JP"])(
  "admits Korean chapter font analysis with source %s",
  (source) => {
    expect(supportsChapterFontLanguagePair(source, "ko-KR")).toBe(true);
    expect(supportsChapterFontSource(source, "待ってください")).toBe(true);
  },
);

it("preserves explicit language scope and uses source glyphs in auto, not output language", () => {
  expect(supportsChapterFontLanguagePair("auto", "en")).toBe(false);
  expect(supportsChapterFontLanguagePair("en", "ko")).toBe(false);
  for (const text of ["待って", "待機", "你好", "ｶﾀｶﾅ", "STOP 待って"])
    expect(supportsChapterFontSource("auto", text)).toBe(true);
  for (const text of ["", "WAIT", "기다려", "123!?", "Привет"])
    expect(supportsChapterFontSource("auto", text)).toBe(false);
  expect(supportsChapterFontSource("en", "待って")).toBe(false);
  expect(supportsChapterFontSource("ja", "WAIT")).toBe(true);
});

async function missingSource(sourceLanguage: string, sourceText: string) {
  const root = await mkdtemp(join(tmpdir(), "mgt-font-language-"));
  roots.push(root);
  const page = {
    ...editingChapter().pages[0],
    imagePath: join(root, "missing.png"),
  };
  const entry: FontChapterC18Page = {
    page,
    items: [
      {
        id: 1,
        bbox: { x: 0, y: 0, w: 100, h: 100 },
        jp: sourceText,
        sourceText,
        ko: "기다려",
        direction: "vertical",
        confidence: 1,
        type: "speech",
        textRole: "ordinary",
      },
    ],
    pageOptions: {
      sourceLanguage,
      targetLanguage: "ko",
      autoFontMatching: true,
    } as TranslationOptions,
  };
  return { root, entry };
}

it.each(["ja", "auto"])(
  "the real %s chapter gateway reports a missing Japanese original instead of silently skipping analysis",
  async (sourceLanguage) => {
    const { root, entry } = await missingSource(
      sourceLanguage,
      "待ってください",
    );
    const port = createFontChapterC18Port({ dataRoot: root } as AppPaths);
    await expect(
      port.prepare([entry], new AbortController().signal),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(entry.pageOptions.sourceLanguage).toBe(sourceLanguage);
  },
);

it("auto Latin-only text does not start the Japanese glyph worker or read an irrelevant original", async () => {
  const { root, entry } = await missingSource("auto", "WAIT");
  const port = createFontChapterC18Port({ dataRoot: root } as AppPaths);
  await expect(
    port.prepare([entry], new AbortController().signal),
  ).resolves.toBeUndefined();
});
