/** @vitest-environment jsdom */

import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PanelFormatFieldKey } from "../src/shared/panelBridgeTypes";
import type { TranslationBlock } from "../src/shared/textTypes";
import { EditorCharacterEffectControls } from "../src/renderer/src/components/EditorCharacterEffectControls";
import { buildBlocksCharacterFormatTarget } from "../src/renderer/src/components/editorCharacterFormatTarget";
import {
  EditorColorGroup,
  TextBackgroundField,
} from "../src/renderer/src/components/EditorColorGroup";
import { TextEffectControls } from "../src/renderer/src/components/EditorTextEffectControls";
import { ColorField } from "../src/renderer/src/components/ColorField";
import {
  hexToRgb,
  hsvToRgb,
  rgbToHex,
  rgbToHsv,
} from "../src/renderer/src/lib/cssColor";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("color field updates", () => {
  it("does not republish the controlled value and restores invalid drafts", () => {
    const onChange = vi.fn();
    render(
      <ColorField
        label="테스트 색상"
        value="#112233"
        disabled={false}
        onChange={onChange}
      />,
    );

    const input = screen.getByRole("textbox", { name: "테스트 색상 HEX" });
    expect(input.getAttribute("data-ui-framed-input")).toBe("");
    fireEvent.change(input, { target: { value: "#112233" } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "#" } });
    expect((input as HTMLInputElement).value).toBe("#");
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe("#112233");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stays finite when the parent immediately controls the next color", () => {
    const onChange = vi.fn();
    function ControlledColor(): React.JSX.Element {
      const [value, setValue] = React.useState("#112233");
      return (
        <ColorField
          label="제어 색상"
          value={value}
          disabled={false}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
        />
      );
    }
    render(<ControlledColor />);

    fireEvent.change(screen.getByRole("textbox", { name: "제어 색상 HEX" }), {
      target: { value: "#abcdef" },
    });
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("#abcdef");
  });

  it("tracks a drag at pointer speed while pacing owner renders", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onChange = renderPacedColor();
    const area = openPickerArea();
    const dialog = screen.getByRole("dialog", { name: "연속 색상" });

    act(() => {
      fireEvent.pointerDown(area, { button: 0, clientX: 0, clientY: 10 });
      for (let index = 1; index <= 80; index += 1) {
        fireEvent.pointerMove(area, { clientX: index, clientY: 10 });
      }
      fireEvent.pointerUp(area);
    });
    const finalColor = colorAt(0.8, 0.9);
    // The picker already shows the newest sample; the owner has rendered none.
    expect(onChange).not.toHaveBeenCalled();
    expect(within(dialog).getByRole<HTMLInputElement>("textbox").value).toBe(
      finalColor.toUpperCase(),
    );

    act(() => vi.advanceTimersByTime(0));
    // 81 samples cost the owner a single render, with the newest color.
    expect(onChange.mock.calls).toEqual([[finalColor]]);
    act(() => vi.advanceTimersByTime(1000));
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("applies the last dragged color when the picker closes mid-drag", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onChange = renderPacedColor();
    const area = openPickerArea();
    act(() => {
      fireEvent.pointerDown(area, { button: 0, clientX: 0, clientY: 10 });
      fireEvent.pointerMove(area, { clientX: 50, clientY: 10 });
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onChange).toHaveBeenLastCalledWith(colorAt(0.5, 0.9));
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "연속 색상 HEX" })
        .value,
    ).toBe(colorAt(0.5, 0.9).toUpperCase());
    vi.useRealTimers();
  });
});

function renderPacedColor(): ReturnType<typeof vi.fn> {
  const onChange = vi.fn();
  function ControlledColor(): React.JSX.Element {
    const [value, setValue] = React.useState("#112233");
    return (
      <ColorField
        label="연속 색상"
        value={value}
        disabled={false}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
      />
    );
  }
  render(<ControlledColor />);
  return onChange;
}

function openPickerArea(): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: "연속 색상 선택" }));
  const area = screen.getByRole("slider", { name: "채도와 밝기" });
  area.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
  return area;
}

/** The color at saturation `s` and value `v` for #112233's hue. */
function colorAt(s: number, v: number): string {
  const { h } = rgbToHsv(hexToRgb("#112233"));
  return rgbToHex(hsvToRgb({ h, s, v }));
}

describe("editor text and outline color swap", () => {
  it("swaps the resolved text and outline colors in one edit", () => {
    const onUpdate = vi.fn();
    renderColors(
      makeBlock({ textColor: "#111111", outlineColor: "#fefefe" }),
      onUpdate,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "글자색과 외곽선색 바꾸기",
      }),
    );

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith({
      textColor: "#fefefe",
      outlineColor: "#111111",
    });
  });

  it("uses editor fallbacks and stays disabled with the panel", () => {
    const onUpdate = vi.fn();
    renderColors(
      makeBlock({ textColor: "invalid", outlineColor: undefined }),
      onUpdate,
      { disabled: true },
    );

    const button = screen.getByRole("button", {
      name: "글자색과 외곽선색 바꾸기",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("offers an outline checkbox and converts only manual edits to pixels", () => {
    const onUpdate = vi.fn();
    const view = renderEffects(
      makeBlock({ outlineColor: "#ffffff", outlineWidthScale: 1 }),
      onUpdate,
    );

    const checkbox = screen.getByRole("checkbox", { name: "외곽선 사용" });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkbox);
    expect(onUpdate).toHaveBeenLastCalledWith({ outlineWidthPx: 0 });

    view.rerender(
      effectsView(
        makeBlock({ outlineColor: "#ffffff", outlineWidthPx: 0 }),
        onUpdate,
      ),
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "외곽선 사용" }));
    expect(onUpdate).toHaveBeenLastCalledWith({ outlineWidthPx: 1.5 });

    view.rerender(
      effectsView(
        makeBlock({ outlineColor: "#ffffff", outlineWidthPx: 1.5 }),
        onUpdate,
      ),
    );
    const input = screen.getByRole("spinbutton", { name: "외곽선 굵기" });
    fireEvent.change(input, { target: { value: "32" } });
    fireEvent.blur(input);
    expect(onUpdate).toHaveBeenLastCalledWith({ outlineWidthPx: 32 });
  });

  it("enables the full text-area background without changing the glyph color", () => {
    const onUpdate = vi.fn();
    const view = render(textBackgroundView(makeBlock(), onUpdate));

    fireEvent.click(screen.getByRole("checkbox", { name: "글자 영역 배경" }));
    expect(onUpdate).toHaveBeenLastCalledWith({
      textBackgroundEnabled: true,
      textBackgroundColor: "#ffffff",
    });

    view.rerender(
      textBackgroundView(
        makeBlock({
          textBackgroundEnabled: true,
          textBackgroundColor: "#ffffff",
        }),
        onUpdate,
      ),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "배경색 HEX" }), {
      target: { value: "#f5f1e8" },
    });
    expect(onUpdate).toHaveBeenLastCalledWith({
      textBackgroundColor: "#f5f1e8",
    });
    expect(onUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ textColor: expect.anything() }),
    );
  });

  it("keeps a whole-selection text color edit off the letter background", () => {
    const onUpdate = vi.fn();
    renderColors(makeBlock(), onUpdate);
    fireEvent.change(screen.getByRole("textbox", { name: "글자색 HEX" }), {
      target: { value: "#223344" },
    });
    expect(onUpdate).toHaveBeenLastCalledWith({ textColor: "#223344" });
    renderEffects(makeBlock(), onUpdate);
    // Letter backgrounds are text runs, so the multi-block target has none.
    expect(screen.queryByRole("checkbox", { name: "글자 배경" })).toBeNull();
  });
});

describe("editor text shadow and glow controls", () => {
  it("sends only the edited character-shadow field for mixed frame selection", () => {
    const onUpdate = vi.fn();
    renderEffects(
      makeBlock({
        textEffect: {
          enabled: true,
          color: "#123456",
          offsetXpx: 2,
          offsetYpx: 2,
          blurPx: 4,
          opacity: 0.5,
        },
      }),
      onUpdate,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "그림자 색상 HEX" }), {
      target: { value: "#abcdef" },
    });
    expect(onUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        textEffectFields: ["color"],
        textEffect: expect.objectContaining({ color: "#abcdef" }),
      }),
    );
    for (const [name, value, field, expected] of [
      ["Y 위치", "-8", "offsetYpx", -8],
      ["블러", "20.5", "blurPx", 20.5],
      ["불투명도", "35", "opacity", 0.35],
    ] as const) {
      const input = screen.getByRole("spinbutton", { name });
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
      expect(onUpdate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          textEffectFields: [field],
          textEffect: expect.objectContaining({ [field]: expected }),
        }),
      );
    }
  });
  it("resolves mixed shadow and glow toggles to enabled", () => {
    const onUpdate = vi.fn();
    render(
      <>
        <ShadowHarness block={makeBlock()} mixed onUpdate={onUpdate} />
        {effectsView(makeBlock(), onUpdate, {
          mixedFields: new Set(["textGlow"]),
        })}
      </>,
    );

    // The first is the settings-default shadow; the character effects list
    // has its own letter shadow after it.
    const shadow = screen.getAllByRole("checkbox", { name: "그림자 사용" })[0];
    const glow = screen.getByRole("checkbox", { name: "광선" });
    expect((shadow as HTMLInputElement).indeterminate).toBe(true);
    expect((glow as HTMLInputElement).indeterminate).toBe(true);
    fireEvent.click(shadow);
    fireEvent.click(glow);

    expect(onUpdate).toHaveBeenCalledWith({
      textEffect: expect.objectContaining({ enabled: true }),
    });
    expect(onUpdate).toHaveBeenCalledWith({
      textGlow: expect.objectContaining({ enabled: true }),
    });
  });

  it("starts disabled, preserves explicit values, and commits direct numeric edits", () => {
    const onUpdate = vi.fn();
    const { rerender } = render(
      <ShadowHarness block={makeBlock()} onUpdate={onUpdate} />,
    );

    const enabled = screen.getByRole("checkbox", { name: "그림자 사용" });
    expect((enabled as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByRole("spinbutton", { name: "X 위치" })).toBeNull();

    fireEvent.click(enabled);
    expect(onUpdate).toHaveBeenLastCalledWith({
      textEffect: {
        enabled: true,
        color: "#000000",
        offsetXpx: 2,
        offsetYpx: 2,
        blurPx: 4,
        opacity: 0.5,
      },
    });

    const textEffect = {
      enabled: true,
      color: "#123456",
      offsetXpx: 2,
      offsetYpx: 2,
      blurPx: 4,
      opacity: 0.5,
    };
    rerender(
      <ShadowHarness block={makeBlock({ textEffect })} onUpdate={onUpdate} />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "그림자 사용" }));
    expect(onUpdate).toHaveBeenLastCalledWith({
      textEffect: { ...textEffect, enabled: false },
    });

    fireEvent.change(screen.getByRole("textbox", { name: "그림자 색상 HEX" }), {
      target: { value: "#abcdef" },
    });
    expect(onUpdate).toHaveBeenLastCalledWith({
      textEffect: { ...textEffect, color: "#abcdef" },
    });

    for (const [name, value, field, expected] of [
      ["X 위치", "-12.5", "offsetXpx", -12.5],
      ["Y 위치", "-8", "offsetYpx", -8],
      ["블러", "20.5", "blurPx", 20.5],
      ["불투명도", "35", "opacity", 0.35],
    ] as const) {
      const input = screen.getByRole("spinbutton", { name });
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
      expect(onUpdate).toHaveBeenLastCalledWith({
        textEffect: { ...textEffect, [field]: expected },
      });
    }
  });

  it("disables the complete effect editor with the block panel", () => {
    render(
      <ShadowHarness
        block={makeBlock({
          textEffect: {
            enabled: true,
            color: "#000000",
            offsetXpx: 0,
            offsetYpx: 0,
            blurPx: 12,
            opacity: 0.8,
          },
        })}
        disabled
        onUpdate={vi.fn()}
      />,
    );

    expect(
      (
        screen.getByRole("checkbox", {
          name: "그림자 사용",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    for (const input of screen.getAllByRole("spinbutton")) {
      expect((input as HTMLInputElement).disabled).toBe(true);
    }
  });

  it("edits glow independently from the directional shadow", () => {
    const onUpdate = vi.fn();
    const view = renderEffects(makeBlock(), onUpdate);

    fireEvent.click(screen.getByRole("checkbox", { name: "광선" }));
    expect(onUpdate).toHaveBeenLastCalledWith({
      textGlow: {
        enabled: true,
        color: "#ffffff",
        blurPx: 4,
        opacity: 0.75,
      },
    });

    const textGlow = {
      enabled: true,
      color: "#abcdef",
      blurPx: 8,
      opacity: 0.6,
    };
    view.rerender(effectsView(makeBlock({ textGlow }), onUpdate));
    fireEvent.change(screen.getByRole("textbox", { name: "광선 색상 HEX" }), {
      target: { value: "#123456" },
    });
    expect(onUpdate).toHaveBeenLastCalledWith({
      textGlow: { ...textGlow, color: "#123456" },
    });

    const glowBlur = screen.getByRole("spinbutton", { name: "퍼짐" });
    fireEvent.change(glowBlur, { target: { value: "12.5" } });
    fireEvent.blur(glowBlur);
    expect(onUpdate).toHaveBeenLastCalledWith({
      textGlow: { ...textGlow, blurPx: 12.5 },
    });

    const glowOpacity = screen.getByRole("spinbutton", { name: "불투명도" });
    fireEvent.change(glowOpacity, { target: { value: "45" } });
    fireEvent.blur(glowOpacity);
    expect(onUpdate).toHaveBeenLastCalledWith({
      textGlow: { ...textGlow, opacity: 0.45 },
    });
    expect(onUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ textEffect: expect.anything() }),
    );
  });
});

type HarnessOptions = {
  disabled?: boolean;
  mixedFields?: ReadonlySet<PanelFormatFieldKey>;
};

/** Several selected blocks: the character controls edit block fields. */
function blocksTarget(
  block: TranslationBlock,
  onUpdate: (patch: Partial<TranslationBlock>) => void,
  mixedFields: ReadonlySet<PanelFormatFieldKey> = new Set(),
) {
  return buildBlocksCharacterFormatTarget({
    block,
    blockCount: 2,
    mixedFields,
    onUpdate,
  });
}

function renderColors(
  block: TranslationBlock,
  onUpdate: (patch: Partial<TranslationBlock>) => void,
  options: HarnessOptions = {},
) {
  return render(
    <EditorColorGroup
      disabled={options.disabled ?? false}
      target={blocksTarget(block, onUpdate, options.mixedFields)}
    />,
  );
}

function effectsView(
  block: TranslationBlock,
  onUpdate: (patch: Partial<TranslationBlock>) => void,
  options: HarnessOptions = {},
): React.JSX.Element {
  return (
    <EditorCharacterEffectControls
      disabled={options.disabled ?? false}
      target={blocksTarget(block, onUpdate, options.mixedFields)}
    />
  );
}

function renderEffects(
  block: TranslationBlock,
  onUpdate: (patch: Partial<TranslationBlock>) => void,
  options: HarnessOptions = {},
) {
  return render(effectsView(block, onUpdate, options));
}

function textBackgroundView(
  block: TranslationBlock,
  onUpdate: (patch: Partial<TranslationBlock>) => void,
): React.JSX.Element {
  return (
    <TextBackgroundField
      block={block}
      disabled={false}
      mixedFields={new Set()}
      onUpdate={onUpdate}
    />
  );
}

function ShadowHarness({
  block,
  disabled = false,
  mixed = false,
  onUpdate,
}: {
  block: TranslationBlock;
  disabled?: boolean;
  mixed?: boolean;
  onUpdate: (patch: Partial<TranslationBlock>) => void;
}): React.JSX.Element {
  return (
    <TextEffectControls
      disabled={disabled}
      effect={block.textEffect}
      mixed={mixed}
      onChange={(textEffect) => onUpdate({ textEffect })}
    />
  );
}

function makeBlock(patch: Partial<TranslationBlock> = {}): TranslationBlock {
  return {
    id: "block-1",
    type: "nonsolid",
    bbox: { x: 100, y: 100, w: 200, h: 200 },
    sourceText: "원문",
    translatedText: "번역",
    confidence: 1,
    sourceDirection: "vertical",
    renderDirection: "horizontal",
    fontSizePx: 24,
    lineHeight: 1.18,
    textAlign: "center",
    textColor: "#111111",
    backgroundColor: "#ffffff",
    opacity: 1,
    autoFitText: true,
    ...patch,
  };
}
