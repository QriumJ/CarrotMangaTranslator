import { describe, expect, it } from "vitest";
import { sanitizeOutputPathSegment } from "../src/shared/outputPathSegment";

describe("portable output directory names", () => {
  it.each([" ", ".", " . "])(
    "removes %j exposed at the truncation boundary (issue #163)",
    (ending) => {
      const prefix = "가".repeat(80 - ending.length);
      expect(
        sanitizeOutputPathSegment(`${prefix}${ending}나머지`, "folder"),
      ).toBe(prefix);
    },
  );

  it("uses the fallback when truncation leaves only dots and spaces", () => {
    expect(sanitizeOutputPathSegment(`${". ".repeat(40)}tail`, "folder")).toBe(
      "folder",
    );
  });

  it("checks reserved names after removing an exposed trailing space", () => {
    expect(
      sanitizeOutputPathSegment(`CON${" ".repeat(77)}tail`, "folder"),
    ).toBe("_CON");
  });

  it.each([79, 80, 81])(
    "preserves safe names up to the limit: %i",
    (length) => {
      expect(sanitizeOutputPathSegment("가".repeat(length), "folder")).toBe(
        "가".repeat(Math.min(length, 80)),
      );
    },
  );

  it("preserves spaces and periods inside names", () => {
    expect(sanitizeOutputPathSegment(" chapter 01. part 2. ", "folder")).toBe(
      "chapter 01. part 2",
    );
  });
});
