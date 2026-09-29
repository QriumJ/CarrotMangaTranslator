/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  makeChapter,
  makePage,
  makeBlock,
} from "./helpers/workspacePointerFixtures";
import {
  useDuplicateSelectedBlockAction,
  useInsertBlockLibraryEntryAction,
} from "../src/renderer/src/hooks/useBlockReadingOrderActions";
import type { UseBlockEditingActionsOptions } from "../src/renderer/src/hooks/blockEditingActionTypes";
import { MAX_BLOCKS_PER_PAGE } from "../src/shared/ipcSchemaPrimitives";
import { SavePagesBlocksRequestSchema } from "../src/shared/ipcLibrarySchemas";
import { collectPageBlockUpdates } from "../src/renderer/src/hooks/chapterPersistencePayload";
import type { BlockLibraryEntryV1 } from "../src/shared/blockLibrary";

afterEach(cleanup);

function harness(count = 1) {
  const page = makePage();
  page.id = "22222222-2222-4222-8222-222222222222";
  page.blocks = Array.from({ length: count }, (_, index) =>
    makeBlock(false, { id: `block-${index}` }),
  );
  let chapter = makeChapter(page);
  chapter.id = "11111111-1111-4111-8111-111111111111";
  let selected: string | null = page.blocks[0].id;
  const pushStatus = vi.fn();
  const update: UseBlockEditingActionsOptions["updateCurrentChapter"] = (
    _id,
    updater,
  ) => {
    chapter = updater(chapter);
  };
  const options = (): UseBlockEditingActionsOptions => ({
    currentChapter: chapter,
    jobActive: false,
    pushStatus,
    selectedPage: chapter.pages[0],
    selectedBlock:
      chapter.pages[0].blocks.find((b) => b.id === selected) ?? null,
    selectedBlockIds: selected ? [selected] : [],
    selectedPageEditLocked: false,
    setSelectedBlockId: (value) => {
      selected = typeof value === "function" ? value(selected) : value;
    },
    setSelectedBlockIds: vi.fn(),
    updateCurrentChapter: update,
  });
  const view = renderHook(
    ({ input }) => ({
      duplicate: useDuplicateSelectedBlockAction(input),
      insert: useInsertBlockLibraryEntryAction(input),
    }),
    { initialProps: { input: options() } },
  );
  return {
    view,
    pushStatus,
    chapter: () => chapter,
    selected: () => selected,
    refresh: () => view.rerender({ input: options() }),
    assertSaveable: () =>
      expect(
        SavePagesBlocksRequestSchema.safeParse({
          chapterId: chapter.id,
          pages: collectPageBlockUpdates(chapter, [page.id], new Map()),
        }).success,
      ).toBe(true),
  };
}

it("keeps repeated copies unique and within the actual save schema", () => {
  const h = harness();
  for (let index = 0; index < 30; index++) {
    act(() => h.view.result.current.duplicate());
    h.refresh();
    h.assertSaveable();
  }
  const ids = h.chapter().pages[0].blocks.map((block) => block.id);
  expect(new Set(ids).size).toBe(31);
  expect(ids.every((id) => id.length <= 200)).toBe(true);
});

it.each(["duplicate", "insert"] as const)(
  "allows the last supported %s then reports capacity without damaging the page",
  (action) => {
    const h = harness(MAX_BLOCKS_PER_PAGE - 1);
    const entry: BlockLibraryEntryV1 = {
      schemaVersion: 1,
      id: "library-entry",
      name: "Saved block",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      lastUsedAt: "2026-01-01T00:00:00Z",
      block: {
        sourceText: "source",
        translatedText: "translated",
        sourceDirection: "horizontal",
        renderDirection: "horizontal",
        fontSizePx: 24,
        lineHeight: 1.2,
        textAlign: "center",
        textColor: "#111111",
        backgroundColor: "#ffffff",
        opacity: 1,
        size: { w: 100, h: 100 },
      },
    };
    const run = () =>
      action === "duplicate"
        ? h.view.result.current.duplicate()
        : h.view.result.current.insert(entry);
    act(run);
    expect(h.chapter().pages[0].blocks).toHaveLength(MAX_BLOCKS_PER_PAGE);
    h.assertSaveable();
    const before = h.chapter();
    const selected = h.selected();
    // Retain the same rendered callback: quick repeated actions must check live data.
    act(run);
    expect(h.chapter()).toBe(before);
    expect(h.selected()).toBe(selected);
    expect(h.pushStatus).toHaveBeenCalled();
    h.assertSaveable();
  },
);
