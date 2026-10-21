/** @vitest-environment jsdom */

import React from "react";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChapterSnapshot, MangaPage } from "../src/shared/libraryTypes";
import type { TranslationBlock } from "../src/shared/textTypes";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import { EditorPanel } from "../src/renderer/src/components/EditorPanel";
import { FontsContext } from "../src/renderer/src/fonts/fontsContextValue";
import type { UseInpaintingActionsOptions } from "../src/renderer/src/hooks/inpaintingActionTypes";
import { useRunBubbleLayoutAction } from "../src/renderer/src/hooks/useRunBubbleLayoutAction";
import { resolveSelectionBubblePadding } from "../src/renderer/src/lib/bubblePaddingSelection";
import { DEFAULT_BLOCK_FONT_CATALOG } from "../src/renderer/src/lib/fonts";

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
);

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("effective selection padding", () => {
  it("compares effective values, falling back to the global setting", () => {
    expect(resolveSelectionBubblePadding([], 0.12)).toBeUndefined();
    // Unset blocks use the configured global value, not a hardcoded 12%.
    expect(resolveSelectionBubblePadding([{}, {}], 0.3)).toBe(0.3);
    expect(resolveSelectionBubblePadding([{}], 0)).toBe(0);
    // Unset with global 12% equals an explicit 12%: not mixed.
    expect(
      resolveSelectionBubblePadding(
        [{}, { bubbleLayoutPaddingRatio: 0.12 }],
        0.12,
      ),
    ).toBe(0.12);
    expect(
      resolveSelectionBubblePadding(
        [{}, { bubbleLayoutPaddingRatio: 0.2 }],
        0.12,
      ),
    ).toBeNull();
    // Without a stored global the shared default applies.
    expect(resolveSelectionBubblePadding([{}], undefined)).toBe(0.12);
  });

  it("shows the session's effective value and mixed state in the panel", () => {
    const view = render(panelView(makeBlock(), { bubblePaddingRatio: 0.3 }));
    expect(paddingField().value).toBe("30");
    view.rerender(
      panelView(makeBlock(), {
        bubblePaddingRatio: null,
        selectedBlockCount: 2,
        selectionKey: '["a","b"]',
      }),
    );
    expect(paddingField().value).toBe("");
    expect(
      (
        screen.getByRole("button", {
          name: "블록 2개에 적용",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

describe("selection bubble-layout run", () => {
  it("never widens an empty explicit selection to the whole page", async () => {
    const startInpainting = stubStart({ status: "completed", blocksErased: 3 });
    const options = makeOptions();
    const { result } = renderHook(() => useRunBubbleLayoutAction(options));
    await act(() =>
      result.current(undefined, { blockIds: [], paddingRatio: 0.1 }),
    );
    expect(startInpainting).not.toHaveBeenCalled();
    expect(options.pushStatus).toHaveBeenCalledWith(
      "말풍선을 감지할 텍스트 블록이 없습니다.",
    );
  });

  it("reports how many layouts changed, not how many matched", async () => {
    const startInpainting = stubStart({ status: "completed", blocksErased: 1 });
    const options = makeOptions();
    const { result } = renderHook(() => useRunBubbleLayoutAction(options));
    await act(() =>
      result.current(undefined, { blockIds: ["a", "b", "c"], paddingRatio: 0 }),
    );
    expect(startInpainting).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "page-bubble-layout",
        blockIds: ["a", "b", "c"],
        paddingRatio: 0,
      }),
    );
    expect(options.pushStatus).toHaveBeenLastCalledWith(
      "선택한 블록 3개 · 말풍선 배치 1개 변경",
    );
  });
});

function stubStart(result: Record<string, unknown>) {
  const startInpainting = vi.fn(async () => result);
  Object.defineProperty(window, "mangaApi", {
    configurable: true,
    value: createTestMangaGatewayStub({
      startInpainting: startInpainting as never,
    }),
  });
  return startInpainting;
}

function makeOptions(): UseInpaintingActionsOptions & {
  pushStatus: ReturnType<typeof vi.fn<(line: string) => void>>;
} {
  const now = "2026-01-01T00:00:00.000Z";
  const page: MangaPage = {
    id: "page-1",
    name: "1.png",
    imagePath: "1.png",
    dataUrl: "data:image/png;base64,",
    width: 1000,
    height: 1000,
    blocks: ["a", "b", "c"].map((id) => makeBlock({ id })),
    analysisStatus: "completed",
    createdAt: now,
    updatedAt: now,
  };
  const chapter: ChapterSnapshot = {
    id: "chapter-1",
    workId: "work-1",
    title: "QA",
    sourceKind: "images",
    status: "idle",
    pageOrder: [page.id],
    pages: [page],
    createdAt: now,
    updatedAt: now,
  };
  return {
    askConfirm: vi.fn(async () => true),
    clearPageImageCache: vi.fn(),
    clearRetouchHistory: vi.fn(),
    currentChapter: chapter,
    dirty: false,
    jobActive: false,
    mergeLiveChapter: vi.fn(),
    patternMaskStrokes: [],
    pushStatus: vi.fn<(line: string) => void>(),
    refreshLibrary: vi.fn(async () => undefined),
    saveNow: vi.fn(async () => undefined),
    selectedPage: page,
    setInpaintingTool: vi.fn(),
    setFlowActive: vi.fn(),
    setJobState: vi.fn(),
    setPatternMaskStrokesByPage: vi.fn(),
    setPeekOriginal: vi.fn(),
    setShowBlockChrome: vi.fn(),
    workspaceHistory: { recordImageEdit: vi.fn() },
  };
}

type PanelOptions = Partial<React.ComponentProps<typeof EditorPanel>>;

function panelView(
  block: TranslationBlock,
  options: PanelOptions = {},
): React.JSX.Element {
  return (
    <FontsContext.Provider
      value={{
        busy: false,
        catalog: DEFAULT_BLOCK_FONT_CATALOG,
        baseOptions: [],
        options: [],
        registerFont: async () => undefined,
        removeFont: async () => undefined,
        savePreferences: async () => undefined,
      }}
    >
      <EditorPanel
        block={block}
        disabled={false}
        onAdjustFontSize={vi.fn()}
        onApplyBubblePadding={vi.fn()}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onUpdate={vi.fn()}
        {...options}
      />
    </FontsContext.Provider>
  );
}

function paddingField(): HTMLInputElement {
  return screen.getByRole("spinbutton", {
    name: "말풍선 여백",
  }) as HTMLInputElement;
}

function makeBlock(patch: Partial<TranslationBlock> = {}): TranslationBlock {
  return {
    id: "a",
    type: "nonsolid",
    bbox: { x: 100, y: 100, w: 300, h: 200 },
    sourceText: "原文",
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
    autoFitText: false,
    ...patch,
  };
}
