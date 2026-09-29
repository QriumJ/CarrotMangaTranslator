/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InpaintingMaskStroke } from "../src/shared/inpaintingTypes";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import { useAppSessionBridgeActions } from "../src/renderer/src/app/session/useAppSessionBridgeActions";
import { useAppSessionCoreState } from "../src/renderer/src/app/session/useAppSessionCoreState";
import { useAppSessionDerivedState } from "../src/renderer/src/app/session/useAppSessionDerivedState";
import { useAppSessionInpaintingController } from "../src/renderer/src/app/session/useAppSessionInpaintingController";
import { useAppSessionUiState } from "../src/renderer/src/app/session/useAppSessionUiState";
import { useWorkspaceHistory } from "../src/renderer/src/hooks/useWorkspaceHistory";
import { makeChapter, makePage } from "./helpers/workspacePointerFixtures";

const askConfirm = vi.fn(async () => false);
const pushStatus = vi.fn();
const startInpainting = vi.fn();
const cancelJob = vi.fn(async () => undefined);
const refreshLibrary = vi.fn(async () => undefined);
const saveNow = vi.fn(async () => undefined);

beforeEach(() => {
  vi.clearAllMocks();
  window.mangaApi = createTestMangaGatewayStub({
    cancelJob,
    getPageImageDataUrl: async () => "data:image/png;base64,AA==",
    startInpainting,
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "mangaApi");
});

describe("production app-session inpainting composition", () => {
  it("adjusts only the selected mask and replays exact before/after states through real history", async () => {
    const h = await renderSession();
    const other = [stroke(17)];
    const selected = [stroke(4), stroke(12)];
    act(() =>
      h.result.current.ui.setPatternMaskStrokesByPage({
        "page-1": selected,
        "page-2": other,
      }),
    );
    act(() =>
      h.result.current.controller.inpaintingBridge.contextValue.onAdjustPatternMask(
        -5,
      ),
    );

    expect(h.result.current.ui.patternMaskStrokesByPage).toEqual({
      "page-1": [stroke(7)],
      "page-2": other,
    });
    expect(selected).toEqual([stroke(4), stroke(12)]);
    expect(h.result.current.history.canUndo).toBe(true);
    await act(async () =>
      expect(await h.result.current.history.undo()).toBe(true),
    );
    expect(h.result.current.ui.patternMaskStrokesByPage).toEqual({
      "page-1": selected,
      "page-2": other,
    });
    await act(async () =>
      expect(await h.result.current.history.redo()).toBe(true),
    );
    expect(h.result.current.ui.patternMaskStrokesByPage["page-1"]).toEqual([
      stroke(7),
    ]);
  });

  it("clears the newly selected page through the real bridge and restores its mask on undo", async () => {
    const h = await renderSession();
    const first = [stroke(8)];
    const second = [stroke(15)];
    act(() =>
      h.result.current.ui.setPatternMaskStrokesByPage({
        "page-1": first,
        "page-2": second,
      }),
    );
    act(() =>
      h.result.current.controller.pageNavigationHandlers.selectPageForReading(
        "page-2",
      ),
    );
    expect(h.result.current.ui.rightRailMode).toBe("page-blocks");
    expect(h.result.current.core.selectedPageIdRef.current).toBe("page-2");
    expect(
      h.result.current.controller.inpaintingBridge.contextValue.maskStrokeCount,
    ).toBe(1);
    act(() =>
      h.result.current.controller.inpaintingBridge.contextValue.onClearPatternMask(),
    );
    expect(h.result.current.ui.patternMaskStrokesByPage).toEqual({
      "page-1": first,
    });
    await act(async () =>
      expect(await h.result.current.history.undo()).toBe(true),
    );
    expect(h.result.current.ui.patternMaskStrokesByPage).toEqual({
      "page-1": first,
      "page-2": second,
    });
  });

  it.each([0, Number.NaN, Number.POSITIVE_INFINITY])(
    "does not create history or replace mask state for no-op delta %s",
    async (delta) => {
      const h = await renderSession();
      act(() =>
        h.result.current.ui.setPatternMaskStrokesByPage({
          "page-1": [stroke(8)],
        }),
      );
      const before = h.result.current.ui.patternMaskStrokesByPage;
      act(() =>
        h.result.current.controller.inpaintingBridge.contextValue.onAdjustPatternMask(
          delta,
        ),
      );
      expect(h.result.current.ui.patternMaskStrokesByPage).toBe(before);
      expect(h.result.current.history.canUndo).toBe(false);
    },
  );

  it("removes zero-radius masks without touching other pages and ignores empty or closed-page commands", async () => {
    const h = await renderSession();
    act(() =>
      h.result.current.ui.setPatternMaskStrokesByPage({
        "page-1": [stroke(4)],
        "page-2": [stroke(8)],
      }),
    );
    act(() =>
      h.result.current.controller.inpaintingBridge.contextValue.onAdjustPatternMask(
        -4,
      ),
    );
    expect(h.result.current.ui.patternMaskStrokesByPage).toEqual({
      "page-2": [stroke(8)],
    });
    act(() => h.result.current.history.reset());
    const before = h.result.current.ui.patternMaskStrokesByPage;
    act(() => {
      h.result.current.controller.inpaintingBridge.contextValue.onClearPatternMask();
      h.result.current.controller.inpaintingBridge.contextValue.onAdjustPatternMask(
        4,
      );
    });
    expect(h.result.current.ui.patternMaskStrokesByPage).toBe(before);
    expect(h.result.current.history.canUndo).toBe(false);
    act(() => h.result.current.core.setCurrentChapter(null));
    act(() =>
      h.result.current.controller.inpaintingBridge.contextValue.onClearPatternMask(),
    );
    expect(h.result.current.ui.patternMaskStrokesByPage).toBe(before);
  });

  it("wires real tool, peek, guide and cancellation actions without a substitute child hook", async () => {
    const h = await renderSession();
    act(() => {
      h.result.current.controller.inpaintingBridge.contextValue.onSelectTool(
        "brush",
      );
      h.result.current.controller.inpaintingBridge.contextValue.onBrushRadiusChange(
        23,
      );
      h.result.current.controller.inpaintingBridge.contextValue.onBrushColorChange(
        "#ff0000",
      );
      h.result.current.controller.inpaintingBridge.contextValue.onShowGuide();
    });
    expect(h.result.current.ui.inpaintingGuideOpen).toBe(true);
    expect(h.result.current.controller.inpaintingBridge.retouchCursor).toEqual({
      mode: "brush",
      color: "#ff0000",
      radiusPx: 23,
    });
    act(() =>
      h.result.current.controller.inpaintingBridge.contextValue.onPeekToggle(),
    );
    expect(h.result.current.ui.peekOriginal).toBe(true);
    await act(async () =>
      h.result.current.controller.inpaintingBridge.contextValue.onCancelJob(),
    );
    expect(cancelJob).toHaveBeenCalledOnce();
  });

  it("blocks real run actions while the selected page is locked and restores confirmation after unlocking", async () => {
    const h = await renderSession(true);
    expect(
      h.result.current.controller.inpaintingBridge.contextValue.jobActive,
    ).toBe(true);
    await act(async () =>
      h.result.current.controller.inpaintingActions.runInpainting("page"),
    );
    expect(askConfirm).not.toHaveBeenCalled();
    expect(startInpainting).not.toHaveBeenCalled();
    h.rerender({ locked: false });
    await act(async () =>
      h.result.current.controller.inpaintingActions.runInpainting("page"),
    );
    expect(askConfirm).toHaveBeenCalledOnce();
    expect(startInpainting).not.toHaveBeenCalled();
    expect(h.result.current.controller.inpaintingActions.actionBusy).toBe(
      false,
    );
  });

  it("keeps page navigation selection reset and removes the real wheel subscription on unmount", async () => {
    const panel = document.createElement("section");
    const removed = vi.spyOn(panel, "removeEventListener");
    const added = vi.spyOn(panel, "addEventListener");
    const h = await renderSession(false, panel);
    act(() => {
      h.result.current.core.setSelectedBlockId("block-1");
      h.result.current.core.setSelectedBlockIds(["block-1"]);
      h.result.current.ui.setRightRailMode("block-editor");
    });
    act(() =>
      expect(
        h.result.current.controller.pageNavigationHandlers.selectAdjacentPageForReading(
          "next",
        ),
      ).toBe(true),
    );
    expect(h.result.current.core.selectedPageId).toBe("page-2");
    expect(h.result.current.core.selectedBlockId).toBeNull();
    expect(h.result.current.core.selectedBlockIds).toEqual([]);
    expect(h.result.current.ui.rightRailMode).toBe("page-blocks");
    const subscriptions = added.mock.calls.filter(
      ([event]) => event === "wheel",
    );
    expect(subscriptions.length).toBeGreaterThan(0);
    h.unmount();
    for (const [, listener] of subscriptions) {
      expect(removed).toHaveBeenCalledWith("wheel", listener);
    }
  });
});

async function renderSession(locked = false, panel: HTMLElement | null = null) {
  const h = renderHook(
    ({ locked: pageLocked }) => useSession(pageLocked, panel),
    {
      initialProps: { locked },
    },
  );
  const chapter = makeChapter(makePage());
  chapter.pages.push({ ...makePage(), id: "page-2", name: "page-2.png" });
  chapter.pageOrder.push("page-2");
  await act(async () => {
    h.result.current.core.setCurrentChapter(chapter);
    h.result.current.core.setSelectedPageId("page-1");
  });
  return h;
}

function useSession(locked: boolean, panel: HTMLElement | null) {
  const core = useAppSessionCoreState();
  const ui = useAppSessionUiState();
  core.currentChapterRef.current = core.currentChapter;
  core.selectedPageIdRef.current = core.selectedPageId;
  core.selectedBlockIdRef.current = core.selectedBlockId;
  core.workspacePanelRef.current = panel;
  const derived = useAppSessionDerivedState({
    currentChapter: core.currentChapter,
    imageRef: core.imageRef,
    inpaintingTool: ui.inpaintingTool,
    jobFlowActive: ui.jobFlowActive,
    jobState: core.jobState,
    patternMaskStrokesByPage: ui.patternMaskStrokesByPage,
    peekOriginal: ui.peekOriginal,
    regionSelection: core.regionSelection,
    selectedBlockId: core.selectedBlockId,
    selectedBlockIds: core.selectedBlockIds,
    selectedPageId: core.selectedPageId,
  });
  const history = useWorkspaceHistory({
    chapterId: core.currentChapter?.id ?? null,
    applyChapterSnapshot: vi.fn(),
    applyMaskSnapshot: (snapshot) =>
      ui.setPatternMaskStrokesByPage((current) => {
        const next = { ...current };
        if (snapshot.strokes.length) next[snapshot.pageId] = snapshot.strokes;
        else delete next[snapshot.pageId];
        return next;
      }),
    applyImageTransaction: async () => "applied",
    onReplayError: vi.fn(),
    onReleaseError: vi.fn(),
  });
  const bridgeActions = useAppSessionBridgeActions(pushStatus);
  const controller = useAppSessionInpaintingController({
    askConfirm,
    bridgeActions,
    core,
    derivedState: { ...derived, selectedPageEditLocked: locked },
    dirty: false,
    exclusiveActivityActive: false,
    mergeLiveChapter: vi.fn(),
    modalOpen: false,
    pushStatus,
    refreshLibrary,
    saveNow,
    translateSelectedRegion: async () => undefined,
    uiState: ui,
    updateCurrentChapter: vi.fn(),
    workspaceHistory: history,
  });
  return { core, ui, history, controller };
}

function stroke(radiusPx: number): InpaintingMaskStroke {
  return { radiusPx, points: [{ x: 30, y: 40 }] };
}
