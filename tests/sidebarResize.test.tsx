/** @vitest-environment jsdom */

import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKSPACE_PREFERENCES_STORAGE_KEY,
  normalizeWorkspacePreferences,
} from "../src/renderer/src/lib/workspacePreferences";
import { ResizeHandle } from "../src/renderer/src/components/ui/ResizeHandle";
import { useSidebarPanelLayout } from "../src/renderer/src/components/useSidebarPanelLayout";
import { SidebarWidthResizer } from "../src/renderer/src/components/SidebarWidthResizer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element as T;
}

/** jsdom has no layout; supply the computed values the hooks read. */
function mockComputedStyle(values: Partial<CSSStyleDeclaration>): void {
  const original = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    const style = original(element);
    return new Proxy(style, {
      get: (target, key) =>
        key in values
          ? values[key as keyof CSSStyleDeclaration]
          : Reflect.get(target, key),
    });
  });
}

describe("sidebar size preferences", () => {
  it("keeps null as the responsive default and clamps stored sizes", () => {
    expect(
      normalizeWorkspacePreferences({
        sidebarWidth: 9999,
        sidebarLibrarySplit: 2,
      }),
    ).toMatchObject({ sidebarWidth: 760, sidebarLibrarySplit: 0.95 });
    expect(
      normalizeWorkspacePreferences({
        sidebarWidth: "wide",
        sidebarLibrarySplit: Number.NaN,
      }),
    ).toMatchObject({ sidebarWidth: null, sidebarLibrarySplit: null });
    expect(
      normalizeWorkspacePreferences({
        sidebarWidth: 512.4,
        sidebarLibrarySplit: 0.33333,
      }),
    ).toMatchObject({ sidebarWidth: 512, sidebarLibrarySplit: 0.333 });
  });

  it("returns to the default split whenever a panel collapses or expands", () => {
    window.localStorage.setItem(
      WORKSPACE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ sidebarLibrarySplit: 0.3 }),
    );
    const { result } = renderHook(() => useSidebarPanelLayout());
    expect(result.current.librarySplit).toBe(0.3);

    act(() => result.current.toggleLibraryContent());
    expect(result.current).toMatchObject({
      collapsedPanel: "library",
      librarySplit: null,
    });
    act(() => result.current.toggleLibraryContent());
    expect(result.current.collapsedPanel).toBeNull();
    expect(result.current.librarySplit).toBeNull();
  });
});

describe("sidebar width resizer", () => {
  function renderInShell(): HTMLElement {
    const { container } = render(
      <main className="app-shell">
        <SidebarWidthResizer />
      </main>,
    );
    const shell = requireElement<HTMLElement>(container, ".app-shell");
    Object.defineProperty(shell, "clientWidth", { value: 1600 });
    return shell;
  }

  it("widens from the current track, clamps to the workspace minimum and resets", () => {
    mockComputedStyle({ gridTemplateColumns: "400px 800px 400px" });
    const shell = renderInShell();
    const handle = screen.getByRole("separator");
    expect(shell.classList.contains("has-custom-sidebar-width")).toBe(false);

    fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    expect(shell.style.getPropertyValue("--app-sidebar-user-width")).toBe(
      "464px",
    );
    expect(shell.classList.contains("has-custom-sidebar-width")).toBe(true);
    expect(shell.classList.contains("is-resizing-sidebar")).toBe(false);

    // 1600 - 400 right rail - 480 workspace leaves at most 720.
    for (let step = 0; step < 6; step += 1) {
      fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    }
    expect(shell.style.getPropertyValue("--app-sidebar-user-width")).toBe(
      "720px",
    );

    const zone = requireElement<HTMLElement>(shell, ".sidebar-width-resizer");
    vi.spyOn(zone, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 8, 900),
    );
    fireEvent.pointerMove(handle, { clientY: 300 });
    expect(zone.style.getPropertyValue("--sidebar-width-reset-y")).toBe(
      "300px",
    );
    fireEvent.pointerMove(handle, { clientY: 899 });
    expect(zone.style.getPropertyValue("--sidebar-width-reset-y")).toBe(
      "880px",
    );

    fireEvent.click(screen.getByRole("button"));
    expect(shell.style.getPropertyValue("--app-sidebar-user-width")).toBe("");
    expect(shell.classList.contains("has-custom-sidebar-width")).toBe(false);
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.activeElement).toBe(handle);
  });

  it("restores a stored width and clears it on double-click", () => {
    window.localStorage.setItem(
      WORKSPACE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ sidebarWidth: 520 }),
    );
    const shell = renderInShell();
    expect(shell.style.getPropertyValue("--app-sidebar-user-width")).toBe(
      "520px",
    );
    fireEvent.doubleClick(screen.getByRole("separator"));
    expect(shell.style.getPropertyValue("--app-sidebar-user-width")).toBe("");
  });
});

describe("sidebar split drag", () => {
  it("maps the dragged library height onto flex shares within panel minimums", () => {
    mockComputedStyle({
      paddingTop: "20px",
      paddingBottom: "0px",
      borderTopWidth: "0px",
      borderBottomWidth: "0px",
    });
    const library = document.createElement("section");
    const handle = document.createElement("div");
    const pages = document.createElement("section");
    document.body.append(library, handle, pages);
    vi.spyOn(library, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 400, 300),
    );
    vi.spyOn(pages, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 300, 400, 340),
    );
    const { result } = renderHook(() => useSidebarPanelLayout());

    act(() => result.current.onSplitResizeStart(handle));
    // 640 total, 40 padding: the library's 300 - 20 of 600 growable px.
    act(() => result.current.onSplitResize(0));
    expect(result.current.librarySplit).toBeCloseTo(280 / 600);
    act(() => result.current.onSplitResize(-1000));
    expect(result.current.librarySplit).toBeCloseTo(100 / 600);
    act(() => result.current.onSplitResize(1000));
    expect(result.current.librarySplit).toBeCloseTo(500 / 600);
    expect(result.current.splitStyle).toEqual({
      "--sidebar-library-share": result.current.librarySplit,
    });
    act(() => result.current.onSplitResizeEnd());
    act(() => result.current.onSplitResize(-50));
    expect(result.current.librarySplit).toBeCloseTo(500 / 600);
    handle.remove();
    library.remove();
    pages.remove();
  });
});

describe("ResizeHandle", () => {
  it("steps with arrow keys along its axis and resets on double-click", () => {
    const onResizeStart = vi.fn();
    const onResize = vi.fn();
    const onResizeEnd = vi.fn();
    const onReset = vi.fn();
    render(
      <ResizeHandle
        orientation="horizontal"
        label="Resize panels"
        onResizeStart={onResizeStart}
        onResize={onResize}
        onResizeEnd={onResizeEnd}
        onReset={onReset}
      />,
    );
    const handle = screen.getByRole("separator", { name: "Resize panels" });
    expect(handle.getAttribute("aria-orientation")).toBe("horizontal");

    fireEvent.keyDown(handle, { key: "ArrowDown" });
    fireEvent.keyDown(handle, { key: "ArrowUp", shiftKey: true });
    // Keys across the axis are left to the page.
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onResize.mock.calls).toEqual([[16], [-64]]);
    expect(onResizeStart).toHaveBeenCalledTimes(2);
    expect(onResizeEnd).toHaveBeenCalledTimes(2);

    fireEvent.doubleClick(handle);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("reports pointer offsets along its axis for the dragging pointer only", () => {
    const onResizeStart = vi.fn();
    const onResize = vi.fn();
    const onResizeEnd = vi.fn();
    render(
      <ResizeHandle
        orientation="vertical"
        label="Resize width"
        onResizeStart={onResizeStart}
        onResize={onResize}
        onResizeEnd={onResizeEnd}
        onReset={vi.fn()}
      />,
    );
    const handle = screen.getByRole("separator");

    fireEvent.pointerDown(handle, { button: 2, pointerId: 1, clientX: 100 });
    expect(onResizeStart).not.toHaveBeenCalled();

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 100 });
    expect(onResizeStart).toHaveBeenCalledWith(handle);
    expect(handle.hasAttribute("data-dragging")).toBe(true);
    expect(document.activeElement).toBe(handle);

    fireEvent.pointerMove(handle, { pointerId: 2, clientX: 400 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 140, clientY: 999 });
    expect(onResize.mock.calls).toEqual([[40]]);

    fireEvent.pointerUp(handle, { pointerId: 2 });
    expect(onResizeEnd).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
    expect(handle.hasAttribute("data-dragging")).toBe(false);

    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 200 });
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
  });
});
