/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FontsContext } from "../src/renderer/src/fonts/fontsContextValue";
import { DEFAULT_BLOCK_FONT_CATALOG } from "../src/renderer/src/lib/fonts";
import { useRichTranslationEditorController } from "../src/renderer/src/components/useRichTranslationEditorController";
import { restoreRichTextEditorSelection } from "../src/renderer/src/lib/richTextEditorDom";
import { makeBlock } from "./helpers/workspacePointerFixtures";

const catalog = {
  catalog: DEFAULT_BLOCK_FONT_CATALOG,
  busy: false,
  baseOptions: [],
  options: [],
  registerFont: async () => undefined,
  removeFont: async () => undefined,
  savePreferences: async () => undefined,
};
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <FontsContext.Provider value={catalog}>{children}</FontsContext.Provider>
);
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.body.replaceChildren();
});

describe("text editing focus lifecycle", () => {
  it("preserves a range while a color control receives focus and the browser emits selectionchange", () => {
    const root = document.createElement("div");
    root.tabIndex = 0;
    root.textContent = "abcd";
    document.body.append(root);
    const { result } = renderHook(
      () =>
        useRichTranslationEditorController({
          block: makeBlock(false, { translatedText: "abcd" }),
          editorRootRef: { current: root },
          value: "abcd",
          onChange: vi.fn(),
        }),
      { wrapper },
    );
    result.current.visual.visualRef.current = root;
    act(() => result.current.beginEditing());
    act(() => {
      root.focus();
      restoreRichTextEditorSelection(root, { start: 1, end: 3 });
      result.current.visual.updateSelection();
    });
    const color = document.createElement("button");
    document.body.append(color);
    act(() =>
      result.current.visual.captureSelectionBeforeControlFocus({
        target: color,
      }),
    );
    expect(window.getSelection()?.toString()).toBe("bc");
    act(() => {
      color.focus();
      // Chromium may collapse its document range while a popup takes focus.
      restoreRichTextEditorSelection(root, { start: 0, end: 0 });
      document.dispatchEvent(new Event("selectionchange"));
    });
    expect(result.current.selection).toEqual({ start: 1, end: 3 });
    expect(result.current.hasSelection).toBe(true);
  });

  it("restores an actual visual range after the next frame and cancels pending focus on exit", async () => {
    const root = document.createElement("div");
    root.tabIndex = 0;
    root.textContent = "abcd";
    document.body.append(root);
    const { result, rerender } = renderHook(
      ({ value }) =>
        useRichTranslationEditorController({
          block: makeBlock(false, { translatedText: value }),
          editorRootRef: { current: root },
          value,
          onChange: vi.fn(),
        }),
      { wrapper, initialProps: { value: "abcd" } },
    );
    result.current.visual.visualRef.current = root;
    act(() => result.current.selectTextRange(1, 3));
    await waitFor(() => expect(window.getSelection()?.toString()).toBe("bc"));
    expect(document.activeElement).toBe(root);
    rerender({ value: "[font=default]abcd[/font]" });
    expect(root.textContent).toBe("abcd");
    const other = document.createElement("button");
    document.body.append(other);
    act(() => {
      result.current.selectTextRange(0, 4);
      result.current.endEditing();
      other.focus();
    });
    await act(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    expect(document.activeElement).toBe(other);
    expect(result.current.editingText).toBe(false);
  });
});
