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
  DEFAULT_WORKSPACE_PREFERENCES,
  WORKSPACE_PREFERENCES_STORAGE_KEY,
  normalizeWorkspacePreferences,
  readWorkspacePreferences,
  writeWorkspacePreference,
} from "../src/renderer/src/lib/workspacePreferences";
import { useWorkspacePreference } from "../src/renderer/src/hooks/useWorkspacePreference";
import { useAppSessionUiState } from "../src/renderer/src/app/session/useAppSessionUiState";
import { RetouchInpaintingStep } from "../src/renderer/src/components/inpaintingPanel/RetouchInpaintingStep";
import { BACKUP_UI_KEYS } from "../src/shared/environmentBackup";
import { COLLAPSED_WORK_IDS_STORAGE_KEY } from "../src/renderer/src/lib/libraryWorkDisclosure";
import {
  useBlockLibraryController,
  type BlockLibrarySource,
} from "../src/renderer/src/components/blockLibraryModel";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("workspace preference storage", () => {
  it("falls back to defaults for missing, corrupt or invalid values", () => {
    expect(normalizeWorkspacePreferences(null)).toEqual(
      DEFAULT_WORKSPACE_PREFERENCES,
    );
    expect(normalizeWorkspacePreferences([1, 2])).toEqual(
      DEFAULT_WORKSPACE_PREFERENCES,
    );
    expect(
      normalizeWorkspacePreferences({
        inpaintingBrushRadius: "40",
        inpaintingPaintColor: "red",
        maskAdjustmentRadius: Number.NaN,
        editorFloating: "true",
        stageToolbarHidden: 1,
        sidebarCollapsedPanel: "chapters",
        webImportSizeFilter: "huge",
        pageTimingView: "chart",
        openTranslationAfterImport: "yes",
        skipDuplicateChapterTitles: null,
        blockLibrarySort: "size",
        regionReviewBrushShape: "star",
        regionReviewBrushSize: "12",
        transformLockRatio: 0,
        gatherTextField: "notes",
        gatherTextExcludeHeaders: "false",
      }),
    ).toEqual(DEFAULT_WORKSPACE_PREFERENCES);
    window.localStorage.setItem(WORKSPACE_PREFERENCES_STORAGE_KEY, "{broken");
    expect(readWorkspacePreferences()).toEqual(DEFAULT_WORKSPACE_PREFERENCES);
  });

  it("clamps slider values to their control bounds and keeps valid choices", () => {
    expect(
      normalizeWorkspacePreferences({
        inpaintingBrushRadius: 500,
        inpaintingPaintColor: "#A1B2C3",
        maskAdjustmentRadius: 0.2,
        editorFloating: true,
        stageToolbarHidden: true,
        sidebarCollapsedPanel: "pages",
        webImportSizeFilter: "medium-or-larger",
        openTranslationAfterImport: false,
        skipDuplicateChapterTitles: true,
        blockLibrarySort: "name",
        regionReviewBrushShape: "square",
        regionReviewBrushSize: 999,
        transformLockRatio: false,
        gatherTextField: "translated",
        gatherTextExcludeHeaders: true,
      }),
    ).toEqual({
      ...DEFAULT_WORKSPACE_PREFERENCES,
      inpaintingBrushRadius: 90,
      inpaintingPaintColor: "#a1b2c3",
      maskAdjustmentRadius: 1,
      editorFloating: true,
      stageToolbarHidden: true,
      sidebarCollapsedPanel: "pages",
      webImportSizeFilter: "medium-or-larger",
      openTranslationAfterImport: false,
      skipDuplicateChapterTitles: true,
      blockLibrarySort: "name",
      regionReviewBrushShape: "square",
      regionReviewBrushSize: 400,
      transformLockRatio: false,
      gatherTextField: "translated",
      gatherTextExcludeHeaders: true,
    });
  });

  it("keeps today's defaults for the newly remembered tool choices", () => {
    expect(DEFAULT_WORKSPACE_PREFERENCES).toMatchObject({
      openTranslationAfterImport: true,
      skipDuplicateChapterTitles: false,
      blockLibrarySort: "recent",
      regionReviewBrushShape: "circle",
      regionReviewBrushSize: 24,
      transformLockRatio: true,
      gatherTextField: "both",
      gatherTextExcludeHeaders: false,
    });
  });

  it("keeps independent display sorting and rejects corrupt sort values", () => {
    writeWorkspacePreference("workPickerSort", "title");
    writeWorkspacePreference("linkedWorkspaceSort", {
      key: "chapters",
      direction: "asc",
    });
    expect(readWorkspacePreferences()).toMatchObject({
      workPickerSort: "title",
      linkedWorkspaceSort: { key: "chapters", direction: "asc" },
    });
    expect(
      normalizeWorkspacePreferences({
        workPickerSort: "size",
        linkedWorkspaceSort: { key: "title", direction: "sideways" },
      }),
    ).toMatchObject({
      workPickerSort: "library",
      linkedWorkspaceSort: { key: "updated", direction: "desc" },
    });
  });

  it.each(["title", [], { key: "unknown", direction: "asc" }])(
    "rejects malformed persisted sorting: %j",
    (linkedWorkspaceSort) => {
      expect(
        normalizeWorkspacePreferences({ linkedWorkspaceSort })
          .linkedWorkspaceSort,
      ).toEqual(DEFAULT_WORKSPACE_PREFERENCES.linkedWorkspaceSort);
    },
  );

  it("merges one field at a time into a versioned key that backups carry", () => {
    writeWorkspacePreference("editorFloating", true);
    writeWorkspacePreference("inpaintingBrushRadius", 3);
    expect(
      JSON.parse(
        window.localStorage.getItem(WORKSPACE_PREFERENCES_STORAGE_KEY) ?? "",
      ),
    ).toEqual({
      ...DEFAULT_WORKSPACE_PREFERENCES,
      editorFloating: true,
      inpaintingBrushRadius: 4,
    });
    expect(BACKUP_UI_KEYS).toContain(WORKSPACE_PREFERENCES_STORAGE_KEY);
    expect(BACKUP_UI_KEYS).toContain(COLLAPSED_WORK_IDS_STORAGE_KEY);
  });

  it("keeps working when storage throws", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    try {
      expect(readWorkspacePreferences()).toEqual(DEFAULT_WORKSPACE_PREFERENCES);
      expect(() =>
        writeWorkspacePreference("editorFloating", true),
      ).not.toThrow();
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

describe("useWorkspacePreference", () => {
  it("updates immediately and writes after the value settles", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useWorkspacePreference("inpaintingBrushRadius", { commitDelayMs: 250 }),
    );
    act(() => result.current[1](30));
    act(() => result.current[1](40));
    expect(result.current[0]).toBe(40);
    expect(storedPreferences()).toBeNull();

    act(() => vi.advanceTimersByTime(250));
    expect(storedPreferences()?.inpaintingBrushRadius).toBe(40);
  });

  it("commits pending values on release and flushes them on unmount", () => {
    vi.useFakeTimers();
    const view = renderHook(() =>
      useWorkspacePreference("maskAdjustmentRadius", { commitDelayMs: 250 }),
    );
    act(() => view.result.current[1](9));
    act(() => view.result.current[2]());
    expect(storedPreferences()?.maskAdjustmentRadius).toBe(9);

    act(() => view.result.current[1](12));
    view.unmount();
    expect(storedPreferences()?.maskAdjustmentRadius).toBe(12);
  });

  it("does not write anything for an untouched preference", () => {
    const view = renderHook(() => useWorkspacePreference("editorFloating"));
    view.unmount();
    expect(storedPreferences()).toBeNull();
  });
});

describe("session UI state", () => {
  it("restores persisted workspace preferences and saves toggles", () => {
    writeWorkspacePreference("inpaintingBrushRadius", 52);
    writeWorkspacePreference("inpaintingPaintColor", "#112233");
    writeWorkspacePreference("editorFloating", true);
    const { result } = renderHook(() => useAppSessionUiState());

    expect(result.current.inpaintingBrushRadius).toBe(52);
    expect(result.current.inpaintingPaintColor).toBe("#112233");
    expect(result.current.editorFloating).toBe(true);
    expect(result.current.stageToolbarHidden).toBe(false);

    act(() => result.current.toggleEditorFloat());
    act(() => result.current.setStageToolbarHidden(true));
    expect(storedPreferences()).toMatchObject({
      editorFloating: false,
      stageToolbarHidden: true,
    });
  });

  it("keeps view, selection and mask state out of persisted preferences", () => {
    const { result } = renderHook(() => useAppSessionUiState());
    act(() => {
      result.current.setShowBlockChrome(false);
      result.current.setShowTextBlocks(false);
      result.current.setPeekOriginal(true);
      result.current.setRightRailMode("block-editor");
      result.current.selectWorkspaceTool("brush");
      result.current.setOriginalImageOpacityForPage("page-1", 0.5);
      result.current.setStageToolbarHidden(true);
    });

    expect(Object.keys(storedPreferences() ?? {}).sort()).toEqual(
      Object.keys(DEFAULT_WORKSPACE_PREFERENCES).sort(),
    );
    const savedKeys = Array.from(
      { length: window.localStorage.length },
      (_, index) => window.localStorage.key(index),
    );
    expect(savedKeys).toEqual([WORKSPACE_PREFERENCES_STORAGE_KEY]);
  });
});

describe("block library sort", () => {
  it("keeps the chosen order for the next opening", () => {
    const options = {
      canInsert: true,
      loadFailedMessage: "load failed",
      onClose: vi.fn(),
      onInsert: vi.fn(),
      source: {
        deleteBlockLibraryEntry: vi.fn(),
        listBlockLibraryEntries: () => new Promise<never>(() => undefined),
        renameBlockLibraryEntry: vi.fn(),
        saveBlockLibraryEntry: vi.fn(),
        updateBlockLibraryEntry: vi.fn(),
        useBlockLibraryEntry: vi.fn(),
      } satisfies BlockLibrarySource,
      useFailedMessage: "use failed",
    };
    const first = renderHook(() => useBlockLibraryController(options));
    expect(first.result.current.sort).toBe("recent");
    act(() => first.result.current.setSort("name"));
    first.unmount();

    const second = renderHook(() => useBlockLibraryController(options));
    expect(second.result.current.sort).toBe("name");
  });
});

describe("mask adjustment slider", () => {
  it("saves the step on release and reuses it after remount", () => {
    const onAdjustPatternMask = vi.fn();
    const view = render(<MaskStep onAdjustPatternMask={onAdjustPatternMask} />);
    const slider = screen.getByRole("slider", { name: /마스크 조절 반경/ });

    fireEvent.change(slider, { target: { value: "11" } });
    expect(screen.getByText("11px")).not.toBeNull();
    fireEvent.pointerUp(slider);
    expect(storedPreferences()?.maskAdjustmentRadius).toBe(11);

    view.unmount();
    render(<MaskStep onAdjustPatternMask={onAdjustPatternMask} />);
    fireEvent.click(screen.getByRole("button", { name: "확장" }));
    expect(onAdjustPatternMask).toHaveBeenCalledWith(11);
  });
});

function MaskStep({
  onAdjustPatternMask,
}: {
  onAdjustPatternMask: (deltaPx: number) => void;
}): React.JSX.Element {
  return (
    <RetouchInpaintingStep
      activeToolLabel="마스크"
      brushColor="#ffffff"
      brushRadius={28}
      colorTool={false}
      hasSelectedPage
      jobActive={false}
      maskStrokeCount={1}
      onAdjustPatternMask={onAdjustPatternMask}
      onBrushColorChange={vi.fn()}
      onBrushRadiusChange={vi.fn()}
      onClearPatternMask={vi.fn()}
      onRunDrawnPattern={vi.fn()}
      sizableTool={false}
      tool="mask"
    />
  );
}

function storedPreferences(): Record<string, unknown> | null {
  const raw = window.localStorage.getItem(WORKSPACE_PREFERENCES_STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
}
