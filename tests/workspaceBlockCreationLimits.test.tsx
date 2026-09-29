// @vitest-environment jsdom

import React, { useEffect, useRef, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_BLOCKS_PER_PAGE } from "../src/shared/ipcSchemaPrimitives";
import type { ChapterSnapshot } from "../src/shared/libraryTypes";
import {
  useCurrentChapterUpdater,
  type UpdateCurrentChapter,
} from "../src/renderer/src/hooks/useCurrentChapterUpdater";
import { useWorkspaceBlockCreateHandlers } from "../src/renderer/src/hooks/useWorkspaceBlockCreateHandlers";
import { pendingPageEdits } from "../src/renderer/src/lib/pageEditBarrier";
import { createWorkspaceInteractionPreviewStore } from "../src/renderer/src/lib/workspaceInteractionPreview";
import {
  makeBlock,
  makeChapter,
  makePage,
} from "./helpers/workspacePointerFixtures";

afterEach(() => {
  cleanup();
  pendingPageEdits.setHandingOff([]);
});

describe("manual workspace block creation capacity", () => {
  it("allows the 500th block and selects it only after the chapter edit succeeds", () => {
    const h = renderCreationHarness(MAX_BLOCKS_PER_PAGE - 1);
    const before = h.chapter();
    const original = structuredClone(before);

    startBlock();
    finishBlock();

    const blocks = h.chapter().pages[0].blocks;
    expect(blocks).toHaveLength(MAX_BLOCKS_PER_PAGE);
    expect(before).toEqual(original);
    expect(blocks.slice(0, -1)).toEqual(before.pages[0].blocks);
    const created = blocks[blocks.length - 1];
    expect(h.current.selectedBlockId).toBe(created.id);
    expect(h.current.selectedBlockIds).toEqual([created.id]);
    expect(h.onBlockCreated).toHaveBeenCalledExactlyOnceWith(created.id);
    expect(h.markDirty).toHaveBeenCalledExactlyOnceWith("page-1");
    expect(h.recordChapterEdit).toHaveBeenCalledOnce();
    expect(h.previews.getBlockCreateRect()).toBeNull();
    expect(h.pushStatus).toHaveBeenCalledExactlyOnceWith(
      "새 텍스트 블록을 추가했습니다.",
    );
  });

  it.each(["already full", "filled before React rerenders"] as const)(
    "preserves the chapter, selection and callbacks when the page is %s",
    (scenario) => {
      const h = renderCreationHarness(
        scenario === "already full"
          ? MAX_BLOCKS_PER_PAGE
          : MAX_BLOCKS_PER_PAGE - 1,
      );
      startBlock();
      expect(h.previews.getBlockCreateRect()).not.toBeNull();
      let before = h.chapter();
      let original = structuredClone(before);

      act(() => {
        if (scenario === "filled before React rerenders") {
          h.current.updateCurrentChapter("page-1", (chapter) => ({
            ...chapter,
            pages: chapter.pages.map((page) => ({
              ...page,
              blocks: [
                ...page.blocks,
                makeBlock(false, { id: "concurrent-block" }),
              ],
            })),
          }));
          before = h.chapter();
          original = structuredClone(before);
          h.markDirty.mockClear();
          h.recordChapterEdit.mockClear();
        }
        // Keep the release callback on the rendered page snapshot. The updater
        // must consult the current chapter even before React renders the addition.
        finishBlock();
      });

      expect(h.chapter()).toBe(before);
      expect(h.chapter()).toEqual(original);
      expect(h.chapter().pages[0].blocks).toHaveLength(MAX_BLOCKS_PER_PAGE);
      expect(h.current.selectedBlockId).toBe("block-1");
      expect(h.current.selectedBlockIds).toEqual(["block-1", "block-2"]);
      expect(h.onBlockCreated).not.toHaveBeenCalled();
      expect(h.markDirty).not.toHaveBeenCalled();
      expect(h.recordChapterEdit).not.toHaveBeenCalled();
      expect(h.previews.getBlockCreateRect()).toBeNull();
      expect(h.pushStatus).toHaveBeenCalledExactlyOnceWith(
        `페이지당 블록은 최대 ${MAX_BLOCKS_PER_PAGE}개입니다. 불필요한 블록을 삭제한 뒤 다시 추가해 주세요.`,
      );
    },
  );
});

type HarnessApi = {
  selectedBlockId: string | null;
  selectedBlockIds: string[];
  updateCurrentChapter: UpdateCurrentChapter;
};

function renderCreationHarness(blockCount: number) {
  const initialChapter = makeChapter(
    makePage({
      additionalBlocks: Array.from({ length: blockCount - 1 }, (_, index) =>
        makeBlock(false, { id: `block-${index + 2}` }),
      ),
    }),
  );
  const chapterRef = { current: initialChapter as ChapterSnapshot | null };
  const previews = createWorkspaceInteractionPreviewStore();
  const markDirty = vi.fn();
  const onBlockCreated = vi.fn();
  const pushStatus = vi.fn();
  const recordChapterEdit = vi.fn(() => true);
  let current: HarnessApi | null = null;

  function Harness() {
    const [chapter, setChapter] = useState<ChapterSnapshot | null>(
      initialChapter,
    );
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(
      "block-1",
    );
    const [selectedBlockIds, setSelectedBlockIds] = useState([
      "block-1",
      "block-2",
    ]);
    const stageRef = useRef<HTMLDivElement | null>(null);
    const updateCurrentChapter = useCurrentChapterUpdater({
      currentChapterRef: chapterRef,
      markDirty,
      setCurrentChapter: setChapter,
      selection: {
        selectedPageId: "page-1",
        selectedBlockId,
        selectedBlockIds,
      },
      workspaceHistory: { recordChapterEdit },
    });
    const handlers = useWorkspaceBlockCreateHandlers({
      active: true,
      getImagePointerRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      interactionPreviewStore: previews,
      onBlockCreated,
      pushStatus,
      selectedPage: chapter?.pages[0] ?? null,
      selectedPageEditLocked: false,
      setSelectedBlockId,
      setSelectedBlockIds,
      stageRef,
      updateCurrentChapter,
    });
    useEffect(() => {
      current = { selectedBlockId, selectedBlockIds, updateCurrentChapter };
    }, [selectedBlockId, selectedBlockIds, updateCurrentChapter]);
    return (
      <div
        data-testid="stage"
        ref={stageRef}
        onPointerDown={handlers.onBlockCreatePointerDown}
        onPointerUp={handlers.onBlockCreatePointerUp}
      />
    );
  }

  render(<Harness />);
  return {
    chapter: () => {
      if (!chapterRef.current)
        throw new Error("Chapter fixture is unavailable");
      return chapterRef.current;
    },
    get current(): HarnessApi {
      if (!current) throw new Error("Harness has not rendered");
      return current;
    },
    markDirty,
    onBlockCreated,
    previews,
    pushStatus,
    recordChapterEdit,
  };
}

function startBlock(): void {
  fireEvent.pointerDown(screen.getByTestId("stage"), {
    button: 0,
    clientX: 10,
    clientY: 10,
    pointerId: 40,
  });
}

function finishBlock(): void {
  fireEvent.pointerUp(screen.getByTestId("stage"), {
    button: 0,
    clientX: 80,
    clientY: 80,
    pointerId: 40,
  });
}
