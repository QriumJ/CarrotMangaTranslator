import {
  isJapaneseLanguageCode,
  isKoreanLanguageCode,
  normalizeSourceLanguageCode,
} from "./translationLanguages";

export function supportsChapterFontLanguagePair(
  sourceLanguage: unknown,
  targetLanguage: unknown,
): boolean {
  return (
    isKoreanLanguageCode(targetLanguage) &&
    (isJapaneseLanguageCode(sourceLanguage) ||
      normalizeSourceLanguageCode(sourceLanguage) === "auto")
  );
}

/** Match the existing C23 is_style_character repertoire, not a guessed language. */
export function supportsChapterFontSource(
  sourceLanguage: unknown,
  sourceText: string,
): boolean {
  return (
    isJapaneseLanguageCode(sourceLanguage) ||
    (normalizeSourceLanguageCode(sourceLanguage) === "auto" &&
      /[\u3041-\u30fa\u4e00-\u9fff]/u.test(sourceText.normalize("NFKC")))
  );
}
