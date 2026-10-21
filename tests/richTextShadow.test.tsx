/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTextStyleToRuns,
  parseRichText,
  serializeRichTextRuns,
} from "../src/shared/richTextMarkup";
import {
  applyBlockCharacterFormat,
  applySelectedBlockFormatPatch,
  clearChangedCharacterOverrides,
} from "../src/shared/richTextBlockFormatting";
import { buildBlocksCharacterFormatTarget } from "../src/renderer/src/components/editorCharacterFormatTarget";
import { pickPanelFormatPatch } from "../src/shared/panelBridgeTypes";
import { PanelCommandSchema } from "../src/shared/panelBridgeSchemas";
import {
  hasInlineTextShadow,
  resolveRunTextEffect,
  shadowPatchToBlockEffect,
} from "../src/shared/richTextShadow";
import { DEFAULT_TEXT_EFFECT } from "../src/shared/textEffect";
import { PageArtwork } from "../src/renderer/src/components/PageArtwork";
import { DEFAULT_BLOCK_FONT_CATALOG } from "../src/renderer/src/lib/fonts";
import { resolveRichTranslationSelectionValues } from "../src/renderer/src/components/richTranslationSelectionModel";
import {
  extractRichTextEditorRuns,
  renderRichTextEditorRuns,
} from "../src/renderer/src/lib/richTextEditorDom";
import { makeBlock } from "./helpers/workspacePointerFixtures";

const shadow = {
  shadowEnabled: true,
  shadowColor: "#ff0000",
  shadowOffsetXpx: -6,
  shadowOffsetYpx: 8,
  shadowBlurPx: 0,
  shadowOpacity: 0.7,
};
const base = makeBlock(false, {
  translatedText: "가나다",
  fontSizePx: 24,
  outlineWidthPx: 0,
  autoFitText: false,
});
const styled = () =>
  applyTextStyleToRuns(parseRichText(base.translatedText).runs, 1, 2, shadow);

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    font: "",
    measureText: (text: string) => ({ width: Array.from(text).length * 12 }),
  } as CanvasRenderingContext2D);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("selected-character shadow", () => {
  it("combines pending caret appearance with shadow and resets each attribute to block defaults", () => {
    const patch = {
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
      emphasisMark: true,
      opacity: 0.3,
      widthScale: 0.8,
      color: "#112233",
      backgroundColor: "#ffffff",
      outlineColor: "#ff0000",
      outlineWidthPx: 2,
      outerOutlineColor: "#00ff00",
      outerOutlineWidthPx: 3,
      glowColor: "#0000ff",
      glowBlurPx: 4,
      glowOpacity: 0.4,
      ...shadow,
    };
    const resolve = (value: typeof patch | Record<keyof typeof patch, null>) =>
      resolveRichTranslationSelectionValues(
        [],
        { start: 0, end: 0 },
        base,
        null,
        value,
      );
    expect(resolve(patch)).toMatchObject({
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
      emphasisMark: true,
      opacityPercent: 30,
      widthPercent: 80,
      color: "#112233",
      backgroundEnabled: true,
      outlineEnabled: true,
      outlineWidthPx: 2,
      outerOutlineEnabled: true,
      glowEnabled: true,
      glowOpacityPercent: 40,
      shadowEnabled: true,
      shadowOffsetXpx: -6,
    });
    const reset = Object.fromEntries(
      Object.keys(patch).map((key) => [key, null]),
    ) as Record<keyof typeof patch, null>;
    expect(resolve(reset)).toMatchObject({
      bold: false,
      italic: false,
      underline: false,
      backgroundEnabled: false,
      shadowEnabled: false,
      opacityPercent: 100,
      widthPercent: 100,
    });
  });
  it("preserves mixed shadow fields across detached multi-block edits and strips command metadata", () => {
    const first = {
      ...base,
      textEffect: { ...DEFAULT_TEXT_EFFECT, enabled: true, color: "#112233" },
    };
    const second = {
      ...first,
      id: "second",
      textEffect: { ...first.textEffect, color: "#abcdef", blurPx: 9 },
      translatedText: serializeRichTextRuns(styled()),
    };
    const onUpdate = vi.fn();
    buildBlocksCharacterFormatTarget({
      block: first,
      blockCount: 2,
      mixedFields: new Set(["textEffect"]),
      onUpdate,
    }).apply({ shadowOffsetXpx: -4 });
    const command = PanelCommandSchema.parse({
      type: "updateSelectionFormat",
      selectionKey: "two",
      patch: pickPanelFormatPatch(onUpdate.mock.calls[0][0]),
    });
    if (command.type !== "updateSelectionFormat")
      throw new Error("Wrong command");
    expect(command.patch.textEffectFields).toEqual(["offsetXpx"]);
    for (const block of [first, second]) {
      const result = applySelectedBlockFormatPatch(block, command.patch);
      expect(result.textEffect).toEqual({ ...block.textEffect, offsetXpx: -4 });
      expect(result).not.toHaveProperty("textEffectFields");
      expect(
        parseRichText(result.translatedText ?? "").runs.every(
          (run) => run.shadowOffsetXpx === undefined,
        ),
      ).toBe(true);
    }
    expect(
      applySelectedBlockFormatPatch(first, { textColor: "#ffffff" }),
    ).toEqual({ textColor: "#ffffff" });
    const missingEffect = {
      textEffect: undefined,
      textEffectFields: ["offsetXpx"] as const,
    };
    expect(applySelectedBlockFormatPatch(first, missingEffect)).toEqual({
      textEffect: undefined,
    });
    expect(
      PanelCommandSchema.safeParse({
        ...command,
        patch: { textEffectFields: ["offsetXpx"] },
      }).success,
    ).toBe(false);
  });
  it("round-trips every property and explicit off without altering adjacent letters", () => {
    const serialized = serializeRichTextRuns(styled());
    const runs = parseRichText(JSON.parse(JSON.stringify(serialized))).runs;
    expect(runs[1]).toMatchObject({ text: "나", ...shadow });
    expect(runs.filter(hasInlineTextShadow)).toHaveLength(1);
    expect(parseRichText(serialized).plainText).toBe("가나다");
    const off = parseRichText(
      serializeRichTextRuns(
        applyTextStyleToRuns(runs, 1, 2, { shadowEnabled: false }),
      ),
    ).runs;
    expect(off[1]).toMatchObject({
      shadowEnabled: false,
      shadowColor: "#ff0000",
    });
    expect(resolveRunTextEffect(base, off[1]).enabled).toBe(false);
    expect(
      serializeRichTextRuns(
        applyTextStyleToRuns(off, 1, 2, { shadowEnabled: null }),
      ),
    ).not.toContain("shadow-enabled");
  });

  it("rejects unsafe/invalid tags and clamps programmatic offsets and opacity", () => {
    for (const text of [
      "[shadow-enabled=yes]x[/shadow-enabled]",
      "[shadow-color=url(x)]x[/shadow-color]",
      "[shadow-x=65]x[/shadow-x]",
    ]) {
      expect(parseRichText(text).plainText).toBe(text);
    }
    const runs = applyTextStyleToRuns(parseRichText("ab").runs, 0, 1, {
      ...shadow,
      shadowOffsetXpx: -100,
      shadowOffsetYpx: 100,
      shadowBlurPx: 100,
      shadowOpacity: 2,
    });
    expect(runs[0]).toMatchObject({
      shadowOffsetXpx: -64,
      shadowOffsetYpx: 64,
      shadowBlurPx: 64,
      shadowOpacity: 1,
    });
    expect(
      shadowPatchToBlockEffect(base, { shadowEnabled: null }),
    ).toBeUndefined();
  });

  it("inherits the block shadow and overrides only the selected attribute", () => {
    const block = {
      ...base,
      textEffect: { ...DEFAULT_TEXT_EFFECT, enabled: true },
    };
    expect(
      resolveRunTextEffect(block, {
        bold: false,
        italic: false,
        shadowColor: "#ff0000",
      }),
    ).toEqual({ ...block.textEffect, color: "#ff0000" });
    const formatted = {
      ...base,
      translatedText: serializeRichTextRuns(styled()),
    };
    const patch = applyBlockCharacterFormat(formatted, {
      shadowColor: "#00ff00",
    });
    expect(patch.textEffect?.color).toBe("#00ff00");
    const runs = parseRichText(patch.translatedText ?? "").runs;
    expect(runs.every((run) => run.shadowColor === undefined)).toBe(true);
    expect(runs[1]).toMatchObject({ shadowEnabled: true, shadowOffsetXpx: -6 });
    const cleared = clearChangedCharacterOverrides(formatted, {
      textEffect: { ...DEFAULT_TEXT_EFFECT, color: "#00ff00" },
    });
    expect(
      parseRichText(cleared.translatedText ?? "").runs[1].shadowColor,
    ).toBeUndefined();
  });

  it("reports mixed fields and pending caret settings with explicit off", () => {
    const values = resolveRichTranslationSelectionValues(
      styled(),
      { start: 0, end: 3 },
      base,
      null,
      null,
    );
    expect(values.mixedFields).toContain("shadowEnabled");
    expect(values.mixedFields).toContain("shadowColor");
    const pending = resolveRichTranslationSelectionValues(
      styled(),
      { start: 2, end: 2 },
      base,
      null,
      { ...shadow, shadowEnabled: false },
    );
    expect(pending).toMatchObject({
      shadowEnabled: false,
      shadowColor: "#ff0000",
      shadowOpacityPercent: 70,
    });
    const reset = resolveRichTranslationSelectionValues(
      [],
      { start: 0, end: 0 },
      base,
      null,
      {
        shadowEnabled: null,
        shadowColor: null,
        shadowOffsetXpx: null,
        shadowOffsetYpx: null,
        shadowBlurPx: null,
        shadowOpacity: null,
      },
    );
    expect(reset).toMatchObject({
      shadowEnabled: false,
      shadowColor: "#000000",
      shadowOpacityPercent: 50,
    });
  });

  it("keeps shadow metadata through visual DOM editing including explicit false", () => {
    const root = document.createElement("div");
    const runs = applyTextStyleToRuns(styled(), 1, 2, { shadowEnabled: false });
    renderRichTextEditorRuns(root, runs, {
      block: base,
      baseBold: false,
      baseItalic: false,
      baseFontSizePx: 24,
      baseFontFamily: "sans-serif",
      baseOpacity: 1,
      resolveFontFamily: () => "sans-serif",
    });
    expect(extractRichTextEditorRuns(root)).toEqual(runs);
  });

  it("uses the same selected-character shadow on a curved baseline", () => {
    const block = {
      ...base,
      translatedText: serializeRichTextRuns(styled()),
      curveLayout: {
        version: 1 as const,
        alignment: "center" as const,
        fitSpacing: false,
        offsetEm: 0,
        orientation: "tangent" as const,
        path: {
          type: "quadratic" as const,
          start: { x: 0, y: 0.5 },
          control: { x: 0.5, y: 0.2 },
          end: { x: 1, y: 0.5 },
        },
      },
    };
    const { container } = render(
      <PageArtwork
        fontCatalog={DEFAULT_BLOCK_FONT_CATALOG}
        imageSrc="source.png"
        page={{
          id: "p",
          name: "p",
          width: 1000,
          height: 1000,
          blocks: [block],
        }}
        visualSize={{ width: 1000, height: 1000 }}
      />,
    );
    const shadows = Array.from(
      container.querySelectorAll<SVGElement>('[data-text-layer="shadow"] text'),
    ).filter((text) => text.style.textShadow);
    expect(shadows.map((text) => text.textContent)).toEqual(["나"]);
    expect(container.querySelector(".text-effect-layer")).toBeNull();
  });

  it.each(["horizontal", "vertical"] as const)(
    "paints just the selected character on a separate shadow plane: %s",
    (direction) => {
      const block = {
        ...base,
        renderDirection: direction,
        translatedText: serializeRichTextRuns(styled()),
      };
      const { container } = render(
        <PageArtwork
          fontCatalog={DEFAULT_BLOCK_FONT_CATALOG}
          imageSrc="source.png"
          page={{
            id: "p",
            name: "p",
            width: 1000,
            height: 1000,
            blocks: [block],
          }}
          visualSize={{ width: 1000, height: 1000 }}
        />,
      );
      expect(container.querySelector(".text-effect-layer")).toBeNull();
      const spans = Array.from(
        container.querySelectorAll<HTMLElement>(".overlay-text-shadow span"),
      ).filter(
        (span) => span.style.textShadow && span.style.textShadow !== "none",
      );
      expect(spans).toHaveLength(1);
      expect(spans[0].textContent).toBe("나");
      expect(spans[0].style.textShadow).toContain("rgba(255, 0, 0, 0.7)");
      expect(container.querySelector(".overlay-text-main")?.textContent).toBe(
        "가나다",
      );
    },
  );
});
