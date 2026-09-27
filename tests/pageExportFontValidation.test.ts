import { expect, it } from "vitest";
import { assertExportFontsLoaded } from "../src/renderer/src/pageExport/fontValidation";
import {
  createBlockFontCatalog,
  DEFAULT_BLOCK_FONT_CATALOG,
  resolveBlockFontFamily,
} from "../src/renderer/src/lib/fonts";

const id = "11111111-1111-4111-8111-111111111111";
const catalog = createBlockFontCatalog(
  [{ id, label: "문제 폰트", family: `MGTUser-${id}`, fileName: `${id}.ttf` }],
  { ...DEFAULT_BLOCK_FONT_CATALOG.preferences, defaultFontId: id },
);
const family = resolveBlockFontFamily(id, catalog);

it("allows successfully loaded fonts", () => {
  expect(() =>
    assertExportFontsLoaded({ failures: [], missingFamilies: [] }, catalog),
  ).not.toThrow();
});
it("names the actual custom font even when it is the default, and gives recovery steps", () => {
  expect(() =>
    assertExportFontsLoaded(
      {
        failures: [
          {
            css: `normal 400 16px ${family}`,
            error: new Error("A network error occurred."),
          },
        ],
        missingFamilies: [],
      },
      catalog,
    ),
  ).toThrow(/“문제 폰트”.*기본 제공 폰트.*TTF\/OTF.*A network error occurred/);
});
it("reports missing managed faces and retains unknown family diagnostics", () => {
  expect(() =>
    assertExportFontsLoaded(
      { failures: [], missingFamilies: [family, "unknown-font"] },
      catalog,
    ),
  ).toThrow(/“문제 폰트”, unknown-font/);
});
it("preserves non-Error details for unknown font failures", () => {
  expect(() =>
    assertExportFontsLoaded(
      { failures: [{ css: "unknown", error: "failed" }], missingFamilies: [] },
      catalog,
    ),
  ).toThrow("unknown (failed)");
});
