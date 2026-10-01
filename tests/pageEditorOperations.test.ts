import { describe, expect, it } from "vitest";
import {
  movePageGroup,
  parsePageRange,
  sortPageSlots,
} from "../src/renderer/src/lib/pageEditorOrder";
import {
  DEFAULT_PAGE_RENAME_RULE as defaults,
  renamePageValues,
} from "../src/renderer/src/lib/pageEditorRename";
import {
  pageNameParts,
  pageOutputNameError,
} from "../src/shared/pageOrganization";
import { buildPageImageExportRelativePath } from "../src/main/jobs/pageImageExportNaming";

const order = ["a", "b", "c", "d", "e"];
const context = { work: "작품", chapter: "1화" };
describe("page editor operations", () => {
  it("moves disjoint groups without changing relative order, including boundaries", () => {
    const selected = new Set(["b", "d"]);
    expect(movePageGroup(order, selected, "up")).toEqual([
      "b",
      "a",
      "d",
      "c",
      "e",
    ]);
    expect(movePageGroup(order, selected, "down")).toEqual([
      "a",
      "c",
      "b",
      "e",
      "d",
    ]);
    expect(movePageGroup(order, selected, "first")).toEqual([
      "b",
      "d",
      "a",
      "c",
      "e",
    ]);
    expect(movePageGroup(order, selected, "last")).toEqual([
      "a",
      "c",
      "e",
      "b",
      "d",
    ]);
    expect(movePageGroup(order, selected, { id: "c", after: false })).toEqual([
      "a",
      "b",
      "d",
      "c",
      "e",
    ]);
    expect(movePageGroup(order, selected, { id: "b", after: true })).toEqual(
      order,
    );
  });
  it("sorts naturally only in selected slots", () => {
    const names = { a: "10", b: "other", c: "2", d: "1", e: "last" };
    expect(
      sortPageSlots(order, new Set(["a", "c", "d"]), names, "asc"),
    ).toEqual(["d", "b", "c", "a", "e"]);
    expect(
      sortPageSlots(order, new Set(["a", "c", "d"]), names, "desc"),
    ).toEqual(order);
    expect(sortPageSlots(order, new Set(["a", "c"]), names, "reverse")).toEqual(
      ["c", "b", "a", "d", "e"],
    );
  });
  it("selects explicit ranges, reversed ranges and rejects invalid input", () => {
    expect([...parsePageRange("3-1, 5", order)]).toEqual(["a", "b", "c", "e"]);
    for (const text of ["0", "6", "1,", "1-x"])
      expect(() => parsePageRange(text, order)).toThrow();
    expect(parsePageRange("", order).size).toBe(0);
  });
  it("applies names in the current target order and composes operations", () => {
    const numbered = renamePageValues(
      ["猫", "고양이"],
      { ...defaults, start: 7, step: 2, position: "whole" },
      context,
    );
    expect(numbered).toEqual(["007", "009"]);
    expect(
      renamePageValues(
        numbered,
        { ...defaults, kind: "insert", text: "-끝", position: "suffix" },
        context,
      ),
    ).toEqual(["007-끝", "009-끝"]);
    expect(
      renamePageValues(
        ["A猫"],
        {
          ...defaults,
          kind: "template",
          text: "{work}-{chapter}-{name}-{number}",
        },
        context,
      ),
    ).toEqual(["작품-1화-A猫-001"]);
  });
  it("handles unicode characters and literal versus regex replacement", () => {
    expect(
      renamePageValues(
        ["😀猫ab"],
        { ...defaults, kind: "remove", count: 1 },
        context,
      ),
    ).toEqual(["猫ab"]);
    expect(
      renamePageValues(
        ["猫😀"],
        { ...defaults, kind: "insert", text: "!", count: 1, position: "at" },
        context,
      ),
    ).toEqual(["猫!😀"]);
    expect(
      renamePageValues(
        ["a.a.A"],
        {
          ...defaults,
          kind: "replace",
          text: "a",
          replacement: "$1",
          all: true,
        },
        context,
      ),
    ).toEqual(["$1.$1.$1"]);
    expect(
      renamePageValues(
        ["p12"],
        {
          ...defaults,
          kind: "replace",
          regex: true,
          text: "p(\\d+)",
          replacement: "$1",
        },
        context,
      ),
    ).toEqual(["12"]);
    expect(() =>
      renamePageValues(
        ["a"],
        { ...defaults, kind: "replace", regex: true, text: "[" },
        context,
      ),
    ).toThrow();
  });
  it("validates list count and supports whitespace, case and existing digits", () => {
    expect(
      renamePageValues(
        ["a", "b"],
        { ...defaults, kind: "list", text: "猫\r\n😀\n" },
        context,
      ),
    ).toEqual(["猫", "😀"]);
    expect(() =>
      renamePageValues(
        ["a", "b"],
        { ...defaults, kind: "list", text: "one" },
        context,
      ),
    ).toThrow("listCount");
    expect(
      renamePageValues(["  a   b  "], { ...defaults, kind: "trim" }, context),
    ).toEqual(["a b"]);
    expect(
      renamePageValues(
        ["aB猫"],
        { ...defaults, kind: "case", upper: true },
        context,
      ),
    ).toEqual(["AB猫"]);
    expect(
      renamePageValues(["p2-10"], { ...defaults, kind: "pad" }, context),
    ).toEqual(["p002-010"]);
  });
  it("preserves extensions and emits explicit output stems exactly", () => {
    expect(pageNameParts("page.001.jpg")).toEqual({
      base: "page.001",
      extension: ".jpg",
    });
    const options = {
      chapterIndex: 0,
      chapterTitle: "화",
      pageIndex: 2,
      pageName: "1.png",
      outputFormat: "psd" as const,
    };
    expect(buildPageImageExportRelativePath(options)).toBe("001-화\\003-1.psd");
    expect(
      buildPageImageExportRelativePath({
        ...options,
        outputBaseName: "표지.수정",
      }),
    ).toBe("001-화\\표지.수정.psd");
    for (const name of ["", "a/b", "CON", "name.", " x", "😀".repeat(61)])
      expect(pageOutputNameError(name)).not.toBeNull();
    expect(pageOutputNameError("고양이_猫😀")).toBeNull();
  });
});
