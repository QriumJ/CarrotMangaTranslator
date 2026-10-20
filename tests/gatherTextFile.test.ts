import { describe, expect, it } from "vitest";
import {
  formatGatheredText,
  type GatheredPage,
} from "../src/shared/gatherText";
import {
  formatGatheredTextFile,
  buildTranslatedTextImport,
} from "../src/shared/gatherTextFile";
import {
  buildReviewRows,
  parseReviewTable,
  serializeReviewRows,
} from "../src/shared/reviewTable";
import { editingChapter } from "./mcpEditing.fixture";

function pages(): GatheredPage[] {
  return ["one", "two"].map((id, index) => ({
    pageId: id,
    pageName: `${id}.png`,
    index,
    blocks: [
      { id: `${id}-block`, sourceText: `原文${id}`, translatedText: "" },
    ],
  }));
}
describe("text exchange regressions", () => {
  it("keeps legacy flat OCR/translation pairs and rejects a truncated pair", () => {
    const original = pages();
    original[0].blocks.push({
      id: "extra",
      sourceText: "추가 원문",
      translatedText: "",
    });
    const text = "# 1쪽 · one.png\n原文one\n첫 번역\n추가 원문\n둘째 번역";
    expect(
      buildTranslatedTextImport(original, text, undefined, "both").updates,
    ).toEqual([
      { pageId: "one", blockId: "one-block", translatedText: "첫 번역" },
      { pageId: "one", blockId: "extra", translatedText: "둘째 번역" },
    ]);
    const truncated = buildTranslatedTextImport(
      original,
      text.replace("\n둘째 번역", ""),
      undefined,
      "both",
    );
    expect(truncated.updates).toEqual([]);
    expect(truncated.warnings).toHaveLength(1);
  });
  it("supports numbered legacy headers without filenames and skips absent numbers", () => {
    const result = buildTranslatedTextImport(
      pages(),
      "# 1쪽\n첫 번역\n\n# 9쪽\n대상 없음",
      undefined,
      "translated",
    );
    expect(result.updates).toEqual([
      { pageId: "one", blockId: "one-block", translatedText: "첫 번역" },
    ]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("9쪽");
  });
  it("handles empty review files and empty table rows without clearing data", () => {
    expect(parseReviewTable("", "auto")).toEqual([]);
    const row = buildReviewRows(editingChapter())[0];
    const content = serializeReviewRows([row], "csv", false);
    expect(parseReviewTable(content + ",,,,,,,,,\r\n", "auto")).toEqual([row]);
    expect(() => parseReviewTable(content + '"unfinished', "csv")).toThrow(
      "따옴표",
    );
  });
  it.each(["source", "both"] as const)(
    "accepts Windows line endings in %s files",
    (field) => {
      const original = pages();
      original[0].blocks[0].sourceText = "원문\r\n두 번째 줄";
      const text = formatGatheredTextFile(original, field);
      const result = buildTranslatedTextImport(original, text);
      expect(result.warnings).toEqual([]);
      expect(result.updates).toEqual([]);
    },
  );
  it("imports first translations into OCR-only pages", () => {
    const result = buildTranslatedTextImport(
      pages(),
      "# 1쪽 · one.png\n첫 번역\n\n# 2쪽 · two.png\n둘째 번역",
      undefined,
      "translated",
    );
    expect(result.warnings).toEqual([]);
    expect(result.updates.map((x) => x.translatedText)).toEqual([
      "첫 번역",
      "둘째 번역",
    ]);
  });
  it("legacy filenames remain authoritative after reordering and reject unknown names", () => {
    const original = pages();
    original[0].blocks[0].translatedText = "first";
    original[1].blocks[0].translatedText = "second";
    const moved = [
      { ...original[1], index: 0 },
      { ...original[0], index: 1 },
    ];
    expect(
      buildTranslatedTextImport(
        moved,
        formatGatheredText(original, "translated"),
        undefined,
        "translated",
      ).updates,
    ).toEqual([]);
    expect(
      buildTranslatedTextImport(
        moved,
        "# 1쪽 · missing.png\nwrong",
        undefined,
        "translated",
      ).updates,
    ).toEqual([]);
  });
  it.each(["both", "translated"] as const)(
    "round-trips %s blocks with internal blanks and reserved lines",
    (field) => {
      const original = pages();
      original[0].blocks[0].sourceText = "원문\n\n다음 원문";
      original[0].blocks[0].translatedText =
        "첫 문단\n\n#@end\n\\literal\n마지막 문단";
      const text = formatGatheredTextFile(original, field, false);
      const result = buildTranslatedTextImport(original, text);
      expect(result).toEqual({
        updates: [],
        matchedPageCount: 2,
        warnings: [],
      });
      const changed = buildTranslatedTextImport(
        original,
        text.replace("마지막 문단", "수정 문단"),
      );
      expect(changed.updates[0].translatedText).toBe(
        "첫 문단\n\n#@end\n\\literal\n수정 문단",
      );
    },
  );
  it("maps file IDs after page rename/reorder and block reorder", () => {
    const original = pages();
    original[0].blocks.push({
      id: "extra",
      sourceText: "추가",
      translatedText: "",
    });
    const text = formatGatheredTextFile(original, "both").replace(
      "原文one\n\n#@end",
      "原文one\n새 번역\n#@end",
    );
    const moved = structuredClone(original).reverse();
    moved[1].pageName = "renamed.png";
    moved[1].blocks.reverse();
    expect(buildTranslatedTextImport(moved, text).updates).toEqual([
      { pageId: "one", blockId: "one-block", translatedText: "새 번역" },
    ]);
  });
  it("source-only export accepts external translation into initially blank blocks", () => {
    const original = pages();
    const text = formatGatheredTextFile(original, "source");
    expect(buildTranslatedTextImport(original, text).updates).toEqual([]);
    expect(
      buildTranslatedTextImport(
        original,
        text.replace("\n原文one\n", "\n첫 번역\n"),
      ).updates,
    ).toEqual([
      { pageId: "one", blockId: "one-block", translatedText: "첫 번역" },
    ]);
  });
  it("rejects changed OCR rather than copying source lines into translation", () => {
    const original = pages();
    original[0].blocks[0].translatedText = "번역";
    const legacy = formatGatheredText(original, "both"),
      modern = formatGatheredTextFile(original, "both");
    original[0].blocks[0].sourceText = "교정 원문";
    for (const text of [legacy, modern]) {
      const result = buildTranslatedTextImport(
        original,
        text,
        undefined,
        "both",
      );
      expect(result.updates).toEqual([]);
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });
  it("rejects duplicate legacy pages and versioned blocks before applying anything", () => {
    const original = pages();
    const legacy = "# 1쪽 · one.png\nfirst\n\n# 1쪽 · one.png\nsecond";
    const modern = formatGatheredTextFile([original[0], original[0]], "source");
    for (const text of [legacy, modern]) {
      const result = buildTranslatedTextImport(
        original,
        text,
        undefined,
        "translated",
      );
      expect(result.updates).toEqual([]);
      expect(result.matchedPageCount).toBe(0);
      expect(result.warnings).toHaveLength(1);
    }
  });
  it.each(["csv", "tsv"] as const)(
    "rejects missing %s cells, while explicit empty cells remain valid",
    (format) => {
      const chapter = editingChapter(),
        rows = buildReviewRows(chapter, "ltr");
      const text = serializeReviewRows(rows, format, false),
        separator = format === "csv" ? "," : "\t";
      const [header, row] = text.split("\r\n");
      expect(() =>
        parseReviewTable(
          header + "\r\n" + row.split(separator).slice(0, 7).join(separator),
          format,
        ),
      ).toThrow("누락");
      expect(
        parseReviewTable(
          serializeReviewRows(
            [{ ...rows[0], translated_text: "", review_note: "" }],
            format,
          ),
          format,
        )[0].translated_text,
      ).toBe("");
    },
  );
  it("rejects duplicate review column names", () => {
    const text = serializeReviewRows(
      buildReviewRows(editingChapter()),
      "csv",
      false,
    );
    expect(() =>
      parseReviewTable(
        text.replace("review_note\r\n", "review_note,translated_text\r\n"),
        "csv",
      ),
    ).toThrow();
  });
  it("rejects a truncated versioned file atomically", () => {
    const original = pages(),
      text = formatGatheredTextFile(original, "source");
    const result = buildTranslatedTextImport(
      original,
      text.slice(0, text.lastIndexOf("#@end")),
    );
    expect(result.updates).toEqual([]);
    expect(result.warnings).toHaveLength(1);
  });
});
