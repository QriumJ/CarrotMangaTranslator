/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobState } from "../src/shared/jobTypes";
import {
  createPanelSelectionKey,
  type PanelFormatSelection,
} from "../src/shared/panelBridgeTypes";
import { PanelCommandSchema } from "../src/shared/panelBridgeSchemas";
import type { TranslationBlock } from "../src/shared/textTypes";
import {
  dispatchPanelCommand,
  type PanelCommandTarget,
} from "../src/renderer/src/app/session/panelCommandDispatcher";
import { EditorPanel } from "../src/renderer/src/components/EditorPanel";
import { JobProgressReadout } from "../src/renderer/src/components/JobProgressReadout";
import { FontsContext } from "../src/renderer/src/fonts/fontsContextValue";
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

describe("block settings: automatic-erase exclusion", () => {
  it("shows mixed exclusion and sets every selected block on change", () => {
    const onUpdate = vi.fn();
    const onUpdateFormat = vi.fn();
    const view = renderPanel(makeBlock({ inpaintExcluded: true }), {
      formatSelection: mixed(["inpaintExcluded"]),
      onUpdate,
      onUpdateFormat,
      selectedBlockCount: 2,
      selectionKey: '["a","b"]',
    });
    const exclusion = exclusionBox();
    expect(exclusion.indeterminate).toBe(true);
    fireEvent.click(exclusion);
    // Mixed resolves to on for all, like the other mixed block toggles.
    expect(onUpdateFormat).toHaveBeenLastCalledWith({ inpaintExcluded: true });

    view.rerender(
      panelView(makeBlock({ inpaintExcluded: true }), {
        onUpdate,
        onUpdateFormat,
        selectedBlockCount: 2,
        selectionKey: '["a","b"]',
      }),
    );
    expect(exclusionBox().checked).toBe(true);
    fireEvent.click(exclusionBox());
    expect(onUpdateFormat).toHaveBeenLastCalledWith({ inpaintExcluded: false });
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("no longer offers a one-block exclusion toggle in the block menu", () => {
    renderPanel(makeBlock({ inpaintExcluded: true }));
    fireEvent.click(screen.getByRole("button", { name: "블록 작업 더 보기" }));
    expect(screen.queryByRole("menuitemcheckbox")).toBeNull();
    expect(screen.getByRole("menuitem", { name: "복제" })).toBeTruthy();
  });
});

describe("block settings: bubble padding draft", () => {
  it("keeps edits as a draft and applies them to every selected block", () => {
    const onApplyBubblePadding = vi.fn();
    renderPanel(makeBlock(), {
      onApplyBubblePadding,
      selectedBlockCount: 3,
      selectionKey: '["a","b","c"]',
    });
    const field = paddingField();
    expect(field.value).toBe("12");
    commit(field, "30");
    expect(onApplyBubblePadding).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "블록 3개에 적용" }));
    expect(onApplyBubblePadding).toHaveBeenCalledExactlyOnceWith(0.3);
    // The user explicitly requires no helper prose, including tooltips.
    fireEvent.focus(paddingField());
    expect(screen.queryByText("0%: 안쪽 여백 없음")).toBeNull();
  });

  it("re-applies an unchanged stored padding and accepts 0%", () => {
    const onApplyBubblePadding = vi.fn();
    renderPanel(makeBlock({ bubbleLayoutPaddingRatio: 0.2 }), {
      onApplyBubblePadding,
    });
    expect(paddingField().value).toBe("20");
    // Re-detecting with the same value recovers an old eroded layout.
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    commit(paddingField(), "0");
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(onApplyBubblePadding.mock.calls).toEqual([[0.2], [0]]);
  });

  it("shows mixed padding and requires a value before Apply", () => {
    const onApplyBubblePadding = vi.fn();
    renderPanel(makeBlock(), {
      formatSelection: mixed(["bubbleLayoutPaddingRatio"]),
      onApplyBubblePadding,
      selectedBlockCount: 2,
      selectionKey: '["a","b"]',
    });
    const apply = screen.getByRole("button", { name: "블록 2개에 적용" });
    expect(paddingField().value).toBe("");
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    commit(paddingField(), "15");
    expect((apply as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(apply);
    expect(onApplyBubblePadding).toHaveBeenCalledWith(0.15);
  });

  it("drops the draft when the selection changes", () => {
    const onApplyBubblePadding = vi.fn();
    const view = renderPanel(makeBlock(), {
      onApplyBubblePadding,
      selectionKey: '["a"]',
    });
    commit(paddingField(), "40");
    expect(paddingField().value).toBe("40");
    view.rerender(
      panelView(makeBlock({ bubbleLayoutPaddingRatio: 0.05 }), {
        onApplyBubblePadding,
        selectionKey: '["a","b"]',
        selectedBlockCount: 2,
      }),
    );
    expect(paddingField().value).toBe("5");
    fireEvent.click(screen.getByRole("button", { name: "블록 2개에 적용" }));
    expect(onApplyBubblePadding).toHaveBeenCalledExactlyOnceWith(0.05);
  });

  it("does not offer Apply where no live page image exists", () => {
    renderPanel(makeBlock({ bubbleLayoutPaddingRatio: 0.2 }), {
      embedded: true,
      templateMode: true,
    });
    const apply = screen.getByRole("button", { name: "적용" });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    expect(paddingField().value).toBe("20");
    expect(paddingField().disabled).toBe(true);
  });
});

describe("detached panel padding command", () => {
  it("validates the range and ignores a stale selection", () => {
    const current = createPanelSelectionKey(["a", "b"]);
    const command = {
      type: "applySelectionBubblePadding",
      selectionKey: current,
      paddingRatio: 0.25,
    } as const;
    expect(PanelCommandSchema.safeParse(command).success).toBe(true);
    expect(
      PanelCommandSchema.safeParse({ ...command, paddingRatio: 0.71 }).success,
    ).toBe(false);

    const applySelectionBubblePadding = vi.fn();
    // Every other target method is an inert spy.
    const actions = new Proxy(
      {},
      {
        get: (_target, key) =>
          key === "applySelectionBubblePadding"
            ? applySelectionBubblePadding
            : vi.fn(),
      },
    ) as PanelCommandTarget;
    const dispatch = (selectionKey: string) =>
      dispatchPanelCommand({
        actions,
        busy: false,
        command: { ...command, selectionKey },
        selectedBlockId: "a",
        selectionKey: current,
      });
    expect(dispatch(createPanelSelectionKey(["a"]))).toBe(false);
    expect(applySelectionBubblePadding).not.toHaveBeenCalled();
    expect(dispatch(current)).toBe(true);
    expect(applySelectionBubblePadding).toHaveBeenCalledWith(0.25);
  });
});

describe("page workflow progress wording", () => {
  it("counts stage tasks for a workflow and keeps plain jobs unchanged", () => {
    const view = render(
      <JobProgressReadout
        jobState={job({ workflowProgress: { pageCount: 80, stageCount: 7 } })}
        progressSnapshot={{
          mode: "determinate",
          current: 123,
          total: 560,
          ratio: 123 / 560,
        }}
        showEta={false}
      />,
    );
    expect(screen.getByText("단계 작업 123 / 560")).toBeTruthy();
    expect(screen.getByText("80페이지 · 7단계")).toBeTruthy();
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("123");
    expect(bar.getAttribute("aria-valuemax")).toBe("560");

    view.rerender(
      <JobProgressReadout
        jobState={job({})}
        progressSnapshot={{
          mode: "determinate",
          current: 3,
          total: 10,
          ratio: 0.3,
        }}
        showEta={false}
      />,
    );
    expect(screen.getByText("3 / 10")).toBeTruthy();
    expect(screen.queryByText(/단계 작업/)).toBeNull();
  });
});

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
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onUpdate={vi.fn()}
        {...options}
      />
    </FontsContext.Provider>
  );
}

function renderPanel(block: TranslationBlock, options: PanelOptions = {}) {
  return render(panelView(block, options));
}

function mixed(
  fields: PanelFormatSelection["mixedFields"],
): PanelFormatSelection {
  return { common: {}, mixedFields: fields };
}

function exclusionBox(): HTMLInputElement {
  return screen.getByRole("checkbox", {
    name: "자동 지우기에서 제외",
  }) as HTMLInputElement;
}

function paddingField(): HTMLInputElement {
  return screen.getByRole("spinbutton", {
    name: "말풍선 여백",
  }) as HTMLInputElement;
}

function commit(input: HTMLElement, value: string): void {
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
}

function job(patch: Partial<JobState>): JobState {
  return {
    id: "job-1",
    kind: "gemma-analysis",
    status: "running",
    progressText: "번역 중",
    ...patch,
  } as JobState;
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
