/** @vitest-environment jsdom */
import { useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useUpdateBlockAction } from "../src/renderer/src/hooks/useUpdateSelectedBlockAction";
import { useUpdateSelectedBlocksAction } from "../src/renderer/src/hooks/useBlockReadingOrderActions";
import { useApplyBlockBackgroundOpacityAction } from "../src/renderer/src/hooks/useApplyBlockBackgroundOpacityAction";
import type { UpdateCurrentChapter } from "../src/renderer/src/hooks/useCurrentChapterUpdater";
import {
  makeBlock,
  makeChapter,
  makePage,
} from "./helpers/workspacePointerFixtures";

function setup(locked = false, jobActive = false) {
  let chapter = makeChapter(
    makePage({
      blockPatch: { opacity: 0.5 },
      additionalBlocks: [makeBlock(false, { id: "block-2", opacity: 0.5 })],
    }),
  );
  const updateCurrentChapter = vi.fn<UpdateCurrentChapter>((_id, update) => {
    chapter = update(chapter);
  });
  const hook = renderHook(() => {
    const [visible, setShowBlockChrome] = useState(false);
    const options = {
      currentChapter: chapter,
      selectedPage: chapter.pages[0],
      selectedBlock: chapter.pages[0].blocks[0],
      selectedBlockIds: ["block-1", "block-2"],
      selectedPageEditLocked: locked,
      jobActive,
      setShowBlockChrome,
      updateCurrentChapter,
      pushStatus: vi.fn(),
      setSelectedBlockId: vi.fn(),
      setSelectedBlockIds: vi.fn(),
    };
    return {
      visible,
      single: useUpdateBlockAction(options),
      multiple: useUpdateSelectedBlocksAction(options),
      scope: useApplyBlockBackgroundOpacityAction(options),
    };
  });
  return { ...hook, chapter: () => chapter, updateCurrentChapter };
}

describe("editing hidden block backgrounds", () => {
  it.each([0, 1])(
    "reveals chrome when a single block opacity is set to %s",
    (opacity) => {
      const test = setup();
      act(() => test.result.current.single("block-1", { opacity }));
      expect(test.result.current.visible).toBe(true);
      expect(
        test.chapter().pages[0].blocks.map((block) => block.opacity),
      ).toEqual([opacity, 0.5]);
    },
  );

  it("reveals chrome for the shared local and detached selection-format action", () => {
    const test = setup();
    act(() => test.result.current.multiple({ opacity: 0.8 }));
    expect(test.result.current.visible).toBe(true);
    expect(
      test.chapter().pages[0].blocks.map((block) => block.opacity),
    ).toEqual([0.8, 0.8]);
  });

  it.each(["page", "chapter"] as const)(
    "reveals %s application even when stored values already match",
    (scope) => {
      const test = setup();
      const original = test.chapter();
      act(() => test.result.current.scope(scope));
      expect(test.result.current.visible).toBe(true);
      expect(test.chapter()).toBe(original);
    },
  );

  it("keeps chrome hidden for unrelated text and character-opacity edits", () => {
    const test = setup();
    act(() => {
      test.result.current.single("block-1", { translatedText: "new text" });
      test.result.current.multiple({ textOpacity: 0.3 });
    });
    expect(test.result.current.visible).toBe(false);
    expect(test.chapter().pages[0].blocks[0].textOpacity).toBe(0.3);
  });

  it("does not reveal or mutate a locked page", () => {
    const test = setup(true);
    act(() => {
      test.result.current.single("block-1", { opacity: 1 });
      test.result.current.multiple({ opacity: 1 });
      test.result.current.scope("page");
    });
    expect(test.result.current.visible).toBe(false);
    expect(test.updateCurrentChapter).not.toHaveBeenCalled();
  });

  it("does not reveal or mutate a chapter when chapter application is blocked", () => {
    const test = setup(false, true);
    act(() => test.result.current.scope("chapter"));
    expect(test.result.current.visible).toBe(false);
    expect(test.updateCurrentChapter).not.toHaveBeenCalled();
  });
});
