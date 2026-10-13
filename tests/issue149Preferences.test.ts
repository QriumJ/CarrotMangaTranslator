import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPORT_PREFERENCES,
  normalizeExportPreferences,
  ExportPreferencesSchema,
} from "../src/shared/exportPreferences";
import { findDuplicateImportChapters } from "../src/shared/importDuplicatePolicy";
import type { ImportChapterDraft } from "../src/shared/importTypes";
import { sanitizeOutputPathSegment } from "../src/shared/outputPathSegment";

describe("repeatable export preferences", () => {
  it("defaults invalid fields independently and never restores destructive per-run flags", () => {
    expect(normalizeExportPreferences(null)).toEqual(
      DEFAULT_EXPORT_PREFERENCES,
    );
    const normalized = normalizeExportPreferences({
      outputFormat: "webp",
      jpegQuality: 0,
      webpQuality: 80,
      preserveSourceNames: false,
      destinationMode: "fixed",
      collisionPolicy: "replace",
      omitText: true,
    });
    expect(normalized).toEqual({
      outputFormat: "webp",
      jpegQuality: 95,
      webpQuality: 80,
      preserveSourceNames: false,
      destinationMode: "fixed",
    });
    expect(
      ExportPreferencesSchema.safeParse({ ...normalized, omitText: true })
        .success,
    ).toBe(false);
  });
  it.each([
    ["CON", "_CON"],
    ["a:b", "a_b"],
    ["../", ".._"],
    [" name. ", "name"],
    ["", "fallback"],
  ])("preserves existing output sanitizer behavior for %s", (input, output) => {
    expect(sanitizeOutputPathSegment(input, "fallback")).toBe(output);
  });
});
describe("duplicate import title policy", () => {
  it("uses edited titles, exact case, trim, preview order and enabled pages", () => {
    const chapters: ImportChapterDraft[] = [
      "one",
      "two",
      "three",
      "four",
      "five",
      "empty",
    ].map((draftId) => ({
      draftId,
      title: "original",
      sourceKind: "images",
      pages:
        draftId === "empty"
          ? []
          : [{ name: "x.png", sourcePath: "x.png", sourceKind: "file" }],
    }));
    const selections = [
      { draftId: "two", title: " New ", enabled: true },
      { draftId: "one", title: "New", enabled: true },
      { draftId: "three", title: "EXISTING", enabled: true },
      { draftId: "four", title: "existing", enabled: true },
      { draftId: "five", title: "existing", enabled: false },
      { draftId: "empty", title: "existing", enabled: true },
    ];
    expect(
      findDuplicateImportChapters(
        chapters,
        selections,
        ["existing"],
        "untitled",
      ),
    ).toEqual([
      { draftId: "two", title: "New" },
      { draftId: "four", title: "existing" },
    ]);
  });
});
