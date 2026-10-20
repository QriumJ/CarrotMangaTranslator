/** Browser-only term fixtures for the production style guide; no library writes. */
export const workContextBridgeSource = `
  const qaStamp = "2026-10-01T00:00:00.000Z";
  const qaTerm = (id, source, target, category, extra) => ({ id, source, target, category, aliases: [], note: "", origin: "ai", enabled: true, createdAt: qaStamp, updatedAt: qaStamp, ...(extra || {}) });
  const qaGlossary = [
    qaTerm("qa-g1", "魔導院", "마도원", "place", { aliases: ["まどういん"], note: "주인공이 다니는 학교" }),
    qaTerm("qa-g2", "竜騎士", "용기사", "term"),
    qaTerm("qa-g3", "聖剣エクスカリバー", "성검 엑스칼리버", "term"),
    qaTerm("qa-g4", "ギルド", "길드", "term", { origin: "manual" }),
    qaTerm("qa-g5", "先輩", "선배", "honorific"),
    qaTerm("qa-g6", "王都", "왕도", "place"),
  ];
  const qaCharacters = [
    { id: "qa-c1", displayName: "아리스", sourceNames: ["アリス"], targetName: "아리스", aliases: [], speechStyle: "polite", customSpeechStyle: "", note: "", origin: "ai", enabled: true, createdAt: qaStamp, updatedAt: qaStamp },
    { id: "qa-c2", displayName: "레온", sourceNames: ["レオン"], targetName: "레온", aliases: [], speechStyle: "rough", customSpeechStyle: "", note: "", origin: "ai", enabled: true, createdAt: qaStamp, updatedAt: qaStamp },
  ];
  const qaGlossaryFile = JSON.stringify({
    format: "carrot-work-glossary", version: 1, exportedAt: qaStamp, workTitle: "마도원의 기사 1부",
    glossary: [
      { source: "魔導院", target: "마도 학원", category: "place", enabled: true },
      { source: "竜騎士", target: "용기사", category: "term", enabled: true },
      { source: "聖剣エクスカリバー", target: "엑스칼리버", category: "term", enabled: true },
      { source: "騎士団長", target: "기사단장", category: "term", enabled: true },
      { source: "辺境伯", target: "변경백", category: "term", enabled: true },
      { source: "魔石", target: "마석", category: "term", enabled: true },
      { source: "魔石", target: "마법석", category: "term", enabled: true },
      { source: "", target: "빈 원문" },
    ],
    characters: [
      { displayName: "アリス", sourceNames: ["アリス"], targetName: "앨리스", speechStyle: "polite", enabled: true },
      { displayName: "ガウェイン", sourceNames: ["ガウェイン"], targetName: "가웨인", speechStyle: "formal", enabled: true },
    ],
  });
  const workContextApi = {
    getWorkStyleGuide: async (workId) => ({ schemaVersion: 1, workId, glossary: qaGlossary, characters: qaCharacters, rules: { prompt: "", honorifics: "adapt", sfxMode: "translate", defaultTone: "natural_korean" }, createdAt: qaStamp, updatedAt: qaStamp }),
    getChapterStoryMemory: async (chapterId) => ({ schemaVersion: 1, workId: "qa-work", chapterId, pages: [], updatedAt: qaStamp }),
    getWorkContextUsage: async (workId) => ({ workId, glossary: [], characters: [] }),
    openWorkGlossaryFile: async () => ({ path: "D:/Backups/마도원의 기사 1부 용어집.json", content: qaGlossaryFile }),
  };
`;
