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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hexToRgb,
  hexToRgba,
  hsvToRgb,
  normalizeHexColor,
  rgbToHex,
  rgbToHsv,
} from "../src/renderer/src/lib/cssColor";
import {
  COLOR_PALETTE_MAX_SWATCHES,
  DEFAULT_WORKSPACE_PREFERENCES,
  normalizeColorPalette,
  readWorkspacePreference,
} from "../src/renderer/src/lib/workspacePreferences";
import {
  addPaletteColor,
  resetColorPaletteCache,
} from "../src/renderer/src/lib/colorPaletteStore";
import { ColorField } from "../src/renderer/src/components/ColorField";
import { ColorPaletteSwatches } from "../src/renderer/src/components/ui/ColorPaletteSwatches";

beforeEach(() => {
  window.localStorage.clear();
  resetColorPaletteCache();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("color math", () => {
  it("round-trips hex through rgb and hsv", () => {
    // One color per hue sector, plus black, white and a gray.
    for (const hex of [
      "#000000",
      "#ffffff",
      "#808080",
      "#fa8128",
      "#80ff00",
      "#00ff80",
      "#0080ff",
      "#8000ff",
      "#ff0080",
      "#123456",
    ]) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
      expect(rgbToHex(hsvToRgb(rgbToHsv(hexToRgb(hex))))).toBe(hex);
    }
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 1, v: 1 });
    expect(rgbToHex(hsvToRgb({ h: 120, s: 1, v: 1 }))).toBe("#00ff00");
    expect(rgbToHex({ r: 300, g: -4, b: 15.6 })).toBe("#ff0010");
    expect(hexToRgba("#fa8128", 2)).toBe("rgba(250, 129, 40, 1)");
  });

  it("accepts only six-digit hex colors", () => {
    expect(normalizeHexColor(" FA8128 ")).toBe("#fa8128");
    expect(normalizeHexColor("#fff")).toBeNull();
    expect(normalizeHexColor("red")).toBeNull();
  });
});

describe("shared color palette", () => {
  it("keeps distinct valid swatches in order up to the limit", () => {
    expect(
      normalizeColorPalette(["#FFFFFF", "bad", "#ffffff", "000000", 7]),
    ).toEqual(["#ffffff", "#000000"]);
    expect(normalizeColorPalette("#ffffff")).toBeUndefined();
    const many = Array.from(
      { length: COLOR_PALETTE_MAX_SWATCHES + 5 },
      (_, index) => `#0000${index.toString(16).padStart(2, "0")}`,
    );
    expect(normalizeColorPalette(many)).toHaveLength(
      COLOR_PALETTE_MAX_SWATCHES,
    );
  });

  it("shares saves and removals across every palette on screen", () => {
    const onSelect = vi.fn();
    render(
      <>
        <ColorPaletteSwatches value="#fa8128" onSelect={onSelect} />
        <ColorPaletteSwatches value="#123456" onSelect={onSelect} />
      </>,
    );
    const [first, second] = screen.getAllByRole("group", { name: "팔레트" });
    expect(
      within(first).getAllByRole("button", { pressed: false }),
    ).toHaveLength(DEFAULT_WORKSPACE_PREFERENCES.colorPalette.length);

    fireEvent.click(
      within(first).getByRole("button", { name: "현재 색을 팔레트에 저장" }),
    );
    expect(
      within(second).getByRole("button", { name: "#FA8128" }),
    ).toBeTruthy();
    expect(readWorkspacePreference("colorPalette")).toContain("#fa8128");
    // The current color is already saved, so saving it again is not offered.
    expect(
      within(first).getByRole<HTMLButtonElement>("button", {
        name: "현재 색을 팔레트에 저장",
      }).disabled,
    ).toBe(true);

    fireEvent.contextMenu(
      within(second).getByRole("button", { name: "#FA8128" }),
    );
    expect(within(first).queryByRole("button", { name: "#FA8128" })).toBeNull();

    fireEvent.keyDown(within(first).getByRole("button", { name: "#000000" }), {
      key: "Delete",
    });
    expect(readWorkspacePreference("colorPalette")).not.toContain("#000000");

    fireEvent.click(within(second).getByRole("button", { name: "#FFFFFF" }));
    expect(onSelect).toHaveBeenCalledWith("#ffffff");
  });
});

describe("in-app color picker", () => {
  function renderField(initial = "#112233") {
    const onChange = vi.fn();
    function Controlled(): React.JSX.Element {
      const [value, setValue] = React.useState(initial);
      return (
        <ColorField
          label="글자색"
          value={value}
          disabled={false}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
        />
      );
    }
    render(<Controlled />);
    return onChange;
  }

  it("replaces the OS dialog with an anchored popover", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const onChange = renderField();
    expect(document.querySelector('input[type="color"]')).toBeNull();
    const trigger = screen.getByRole("button", { name: "글자색 선택" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "글자색" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const red = within(dialog).getByRole<HTMLInputElement>("spinbutton", {
      name: "빨강",
    });
    fireEvent.change(red, { target: { value: "255" } });
    fireEvent.blur(red);
    act(() => vi.advanceTimersByTime(0));
    expect(onChange).toHaveBeenLastCalledWith("#ff2233");

    fireEvent.keyDown(within(dialog).getByRole("slider", { name: "색조" }), {
      key: "ArrowRight",
      shiftKey: true,
    });
    // Past the longest quiet gap the pacer leaves after an owner render.
    act(() => vi.advanceTimersByTime(300));
    expect(onChange).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    vi.useRealTimers();
  });

  it("applies a palette swatch and closes", () => {
    addPaletteColor("#336699");
    const onChange = renderField();
    fireEvent.click(screen.getByRole("button", { name: "글자색 선택" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "#336699",
      }),
    );
    expect(onChange).toHaveBeenCalledWith("#336699");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "글자색 HEX" })
        .value,
    ).toBe("#336699");
  });

  it("samples the screen through the eyedropper when available", async () => {
    class FakeEyeDropper {
      open(): Promise<{ sRGBHex: string }> {
        return Promise.resolve({ sRGBHex: "#ABCDEF" });
      }
    }
    vi.stubGlobal("EyeDropper", FakeEyeDropper);
    const onChange = renderField();
    fireEvent.click(screen.getByRole("button", { name: "글자색 선택" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "화면에서 색 추출" }));
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(onChange).toHaveBeenCalledWith("#abcdef");
  });

  it("leaves a slow owner's next color until twice its render time passed", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let clock = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    const applied: string[] = [];
    function SlowOwner(): React.JSX.Element {
      const [value, setValue] = React.useState("#112233");
      return (
        <ColorField
          label="글자색"
          value={value}
          disabled={false}
          onChange={(next) => {
            clock += 40; // the owner's render costs 40ms
            applied.push(next);
            setValue(next);
          }}
        />
      );
    }
    render(<SlowOwner />);
    fireEvent.click(screen.getByRole("button", { name: "글자색 선택" }));
    const hue = screen.getByRole("slider", { name: "색조" });

    fireEvent.keyDown(hue, { key: "ArrowRight", shiftKey: true });
    act(() => vi.advanceTimersByTime(0));
    expect(applied).toHaveLength(1);

    fireEvent.keyDown(hue, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(hue, { key: "ArrowRight", shiftKey: true });
    act(() => vi.advanceTimersByTime(79));
    expect(applied).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    // Only the newest of the two samples reaches the owner.
    expect(applied).toHaveLength(2);
    expect(
      within(screen.getByRole("dialog")).getByRole<HTMLInputElement>("textbox")
        .value,
    ).toBe(applied[1].toUpperCase());
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("hides the eyedropper where the platform has none", () => {
    renderField();
    fireEvent.click(screen.getByRole("button", { name: "글자색 선택" }));
    expect(
      screen.queryByRole("button", { name: "화면에서 색 추출" }),
    ).toBeNull();
  });
});
