/** @vitest-environment jsdom */
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { EditorPanel } from "../src/renderer/src/components/EditorPanel";
import { TextGlowControls } from "../src/renderer/src/components/EditorTextEffectControls";
import { FontsContext } from "../src/renderer/src/fonts/fontsContextValue";
import { DEFAULT_BLOCK_FONT_CATALOG } from "../src/renderer/src/lib/fonts";
import { makeBlock } from "./helpers/workspacePointerFixtures";
beforeAll(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  ),
);
afterAll(() => vi.unstubAllGlobals());
const fonts = {
  catalog: DEFAULT_BLOCK_FONT_CATALOG,
  busy: false,
  options: [],
  baseOptions: [],
  registerFont: async () => undefined,
  removeFont: async () => undefined,
  savePreferences: async () => undefined,
};
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});
function panel(onDeleteStylePreset?: (id: string) => boolean) {
  return (
    <FontsContext.Provider value={fonts}>
      <EditorPanel
        block={makeBlock(false, { translatedText: "text" })}
        disabled={false}
        onAdjustFontSize={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onUpdate={vi.fn()}
        stylePresets={[
          { id: "one", name: "대사", pinned: true, missingFont: false },
        ]}
        onDeleteStylePreset={onDeleteStylePreset}
      />
    </FontsContext.Provider>
  );
}
describe("integrated formatting lifecycle controls", () => {
  it("clears the active preset only after successful deletion", async () => {
    const view = render(panel());
    const trigger = screen.getByRole("button", { name: "프리셋 선택" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "대사" }));
    fireEvent.click(screen.getByRole("button", { name: "대사" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "대사 삭제" }));
    await waitFor(() => expect(trigger.textContent).toContain("대사"));
    // Optional integrations fail closed without losing the current preset.
    await act(async () =>
      fireEvent.click(
        screen.getByRole("menuitem", { name: "대사 현재 서식으로 덮어쓰기" }),
      ),
    );
    expect(trigger.textContent).toContain("대사");
    const remove = vi.fn(() => true);
    view.rerender(panel(remove));
    await act(async () =>
      fireEvent.click(screen.getByRole("menuitem", { name: "대사 삭제" })),
    );
    expect(remove).toHaveBeenCalledWith("one");
    expect(trigger.textContent).toContain("프리셋 선택");
  });
  it("Escape in the translation exits character editing and returns focus control", () => {
    render(panel());
    const editor = screen.getByRole("textbox", { name: "번역문" });
    act(() => editor.focus());
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(document.activeElement).not.toBe(editor);
    expect(screen.getByText("블록 전체 글자")).toBeTruthy();
  });
  it("supports the whole-glow mixed contract for callers without field-level values", () => {
    const onChange = vi.fn();
    render(
      <TextGlowControls
        disabled={false}
        mixed
        glow={undefined}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "광선" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true }),
      { enabled: true },
    );
  });
});
