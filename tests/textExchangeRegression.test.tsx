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
import { afterEach, expect, it, vi } from "vitest";
import { editingChapter } from "./mcpEditing.fixture";
import { applyTranslatedTextUpdates } from "../src/renderer/src/app/session/applyTranslatedTextUpdates";
import { applyReviewTextImport } from "../src/renderer/src/app/session/applyReviewTextImport";
import { useCurrentChapterUpdater } from "../src/renderer/src/hooks/useCurrentChapterUpdater";
import { createChapterHistoryEntry } from "../src/renderer/src/hooks/workspaceHistoryEntries";
import {
  emptyWorkspaceHistory,
  recordWorkspaceHistory,
  restoreWorkspaceChapterEditSnapshot,
} from "../src/renderer/src/lib/workspaceHistory";
import {
  buildReviewRows,
  serializeReviewRows,
} from "../src/shared/reviewTable";
import { GatherTextModal } from "../src/renderer/src/components/GatherTextModal";
import { createGatherTextProps } from "../src/renderer/src/app/session/createGatherTextProps";
import type { AppSessionViewModel } from "../src/renderer/src/app/session/appSessionViewModel";
import { pendingPageEdits } from "../src/renderer/src/lib/pageEditBarrier";
import { gatherText, formatGatheredText } from "../src/shared/gatherText";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

it.each(["translated", "both"] as const)(
  "imports first translations through the %s TXT menu",
  async (field) => {
    const chapter = editingChapter();
    chapter.pages[0].blocks.forEach((block) => {
      block.translatedText = "";
    });
    const translated = structuredClone(chapter);
    translated.pages[0].blocks.forEach((block) => {
      block.translatedText = `첫 번역-${block.id}`;
    });
    const content = formatGatheredText(
      gatherText({
        chapter: translated,
        page: translated.pages[0],
        scope: "page",
      }),
      field,
    );
    const onApplyTranslatedText = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const view = render(
      <GatherTextModal
        chapter={chapter}
        page={chapter.pages[0]}
        onClose={vi.fn()}
        onApplyTranslatedText={onApplyTranslatedText}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "가져오기 · 내보내기" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", {
        name:
          field === "both" ? "원문+번역 TXT 불러오기" : "번역문 TXT 불러오기",
      }),
    );
    const input = view.container.querySelector('input[accept^=".txt"]');
    if (!input) throw new Error("Missing TXT input");
    const file = new File([content], "translated.txt");
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => new TextEncoder().encode(content).buffer,
    });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    expect(onApplyTranslatedText).toHaveBeenCalledWith(
      expect.arrayContaining([
        { pageId: "page", blockId: "a", translatedText: "첫 번역-a" },
        { pageId: "page", blockId: "b", translatedText: "첫 번역-b" },
      ]),
      chapter,
    );
  },
);
function editor() {
  const original = editingChapter();
  original.pages = ["p1", "p2", "p3"].map((id) => ({
    ...structuredClone(original.pages[0]),
    id,
  }));
  original.pageOrder = original.pages.map((p) => p.id);
  const currentChapterRef = { current: original };
  let history = emptyWorkspaceHistory();
  const hook = renderHook(() =>
    useCurrentChapterUpdater({
      currentChapterRef,
      markDirty: vi.fn(),
      setCurrentChapter: vi.fn(),
      selection: {
        selectedPageId: "p1",
        selectedBlockId: null,
        selectedBlockIds: [],
      },
      workspaceHistory: {
        recordChapterEdit: (input) => {
          history = recordWorkspaceHistory(
            history,
            createChapterHistoryEntry(input),
          ).state;
          return true;
        },
      },
    }),
  );
  return {
    original,
    currentChapterRef,
    update: hook.result.current,
    history: () => history,
  };
}

function importSession(f: ReturnType<typeof editor>) {
  const saveNow = vi.fn(async () => undefined);
  const model = defineFixture<AppSessionViewModel>({
    core: {
      currentChapter: f.original,
      currentChapterRef: f.currentChapterRef,
      library: { works: [] },
    },
    derivedState: {
      selectedPage: f.original.pages[0],
      selectedPageEditLocked: false,
    },
    workspaceHistory: { busy: false },
    persistence: { saveNow },
    uiState: { textViewOpen: true },
    settingsDialog: { settings: null },
    updateCurrentChapter: f.update,
  });
  const props = createGatherTextProps(model);
  if (!props?.onImportReviewText || !props.onApplyTranslatedText)
    throw new Error("Missing import callbacks");
  return {
    onImportReviewText: props.onImportReviewText,
    onApplyTranslatedText: props.onApplyTranslatedText,
    saveNow,
  };
}

it("shows localized row diagnostics and leaves an invalid review status unchanged", () => {
  const f = editor();
  const row = buildReviewRows(f.original)[0];
  const result = applyReviewTextImport(
    f.original,
    {
      chapterId: f.original.id,
      format: "csv",
      content: serializeReviewRows(
        [{ ...row, review_status: "unknown-status" }],
        "csv",
      ),
    },
    f.update,
  );
  expect(result.updatedBlockCount).toBe(0);
  expect(result.warnings).toEqual([
    "2행: 검수 상태 unknown-status는 사용할 수 없습니다.",
  ]);
  expect(f.history().past).toHaveLength(0);
});

it("flushes pending edits, imports onto the latest chapter, and saves without resetting history", async () => {
  const f = editor(),
    session = importSession(f);
  const row = buildReviewRows(f.original).find(
    (row) => row.page_id === "p1" && row.block_id === "a",
  );
  if (!row) throw new Error("Missing review row");
  const unregister = pendingPageEdits.registerEnvironmentFlusher(async () => {
    f.update("p2", (chapter) => ({
      ...chapter,
      pages: chapter.pages.map((page) =>
        page.id === "p2"
          ? {
              ...page,
              blocks: page.blocks.map((block) => ({
                ...block,
                fontSizePx: 77,
              })),
            }
          : page,
      ),
    }));
  });
  try {
    await act(async () => {
      await session.onImportReviewText({
        chapterId: f.original.id,
        format: "csv",
        content: serializeReviewRows(
          [{ ...row, translated_text: "imported" }],
          "csv",
        ),
      });
    });
    expect(f.currentChapterRef.current.pages[1].blocks[0].fontSizePx).toBe(77);
    expect(f.currentChapterRef.current.pages[0].blocks[0].translatedText).toBe(
      "imported",
    );
    expect(session.saveNow).toHaveBeenCalledOnce();
    expect(f.history().past).toHaveLength(2);
  } finally {
    unregister();
  }
});

it("rejects TXT reads against a stale chapter snapshot", () => {
  const f = editor(),
    session = importSession(f);
  act(() => f.update("p2", (chapter) => ({ ...chapter, title: "latest" })));
  expect(() =>
    session.onApplyTranslatedText(
      [{ pageId: "p1", blockId: "a", translatedText: "stale" }],
      f.original,
    ),
  ).toThrow("변경");
  expect(f.currentChapterRef.current.pages[0].blocks[0].translatedText).toBe(
    "original-a",
  );
});

it("rejects review import if the chapter changes while pending edits flush", async () => {
  const f = editor(),
    session = importSession(f);
  const unregister = pendingPageEdits.registerEnvironmentFlusher(async () => {
    f.currentChapterRef.current = { ...f.original, id: "other-chapter" };
  });
  try {
    await expect(
      session.onImportReviewText({
        chapterId: f.original.id,
        format: "csv",
        content: "",
      }),
    ).rejects.toThrow("회차");
    expect(session.saveNow).not.toHaveBeenCalled();
    expect(f.history().past).toHaveLength(0);
  } finally {
    unregister();
  }
});
it("undoes and redoes all pages from one TXT import, without merging consecutive imports", () => {
  const f = editor();
  const updates = f.original.pages.map((p) => ({
    pageId: p.id,
    blockId: "a",
    translatedText: `new-${p.id}`,
  }));
  act(() => applyTranslatedTextUpdates(updates, f.update));
  const entry = f.history().past[0];
  if (entry.kind !== "chapter-edit") throw new Error("Missing chapter history");
  expect(entry.before.pages).toHaveLength(3);
  expect(entry.after.pages).toHaveLength(3);
  const undone = restoreWorkspaceChapterEditSnapshot(
    f.currentChapterRef.current,
    entry.before,
  );
  expect(undone.pages.map((p) => p.blocks[0].translatedText)).toEqual([
    "original-a",
    "original-a",
    "original-a",
  ]);
  expect(
    restoreWorkspaceChapterEditSnapshot(undone, entry.after).pages.map(
      (p) => p.blocks[0].translatedText,
    ),
  ).toEqual(["new-p1", "new-p2", "new-p3"]);
  act(() =>
    applyTranslatedTextUpdates(
      updates.map((u) => ({ ...u, translatedText: "again" })),
      f.update,
    ),
  );
  expect(f.history().past).toHaveLength(2);
});
it("review import preserves unrelated latest edits and is undoable", () => {
  const f = editor();
  f.currentChapterRef.current.pages[1].blocks[0].fontSizePx = 77;
  const rows = buildReviewRows(f.original)
    .filter((r) => r.page_id === "p1" && r.block_id === "a")
    .map((r) => ({ ...r, translated_text: "imported" }));
  act(() =>
    applyReviewTextImport(
      f.currentChapterRef.current,
      {
        chapterId: f.original.id,
        content: serializeReviewRows(rows, "csv"),
        format: "csv",
      },
      f.update,
    ),
  );
  expect(f.currentChapterRef.current.pages[1].blocks[0].fontSizePx).toBe(77);
  expect(f.currentChapterRef.current.pages[0].blocks[0].translatedText).toBe(
    "imported",
  );
  const entry = f.history().past[0];
  if (entry.kind !== "chapter-edit") throw new Error("Missing history");
  expect(
    restoreWorkspaceChapterEditSnapshot(
      f.currentChapterRef.current,
      entry.before,
    ).pages[0].blocks[0].translatedText,
  ).toBe("original-a");
});
it("does not apply review imports to another chapter", () => {
  const f = editor();
  expect(() =>
    applyReviewTextImport(
      { ...f.original, id: "other" },
      { chapterId: f.original.id, content: "", format: "csv" },
      f.update,
    ),
  ).toThrow();
  expect(f.history().past).toHaveLength(0);
});
it("cancels a review file read after the modal closes", async () => {
  const chapter = editingChapter(),
    onImportReviewText = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  let resolve!: (bytes: ArrayBuffer) => void;
  const pending = new Promise<ArrayBuffer>((r) => {
    resolve = r;
  });
  const view = render(
    <GatherTextModal
      chapter={chapter}
      page={chapter.pages[0]}
      onClose={vi.fn()}
      onImportReviewText={onImportReviewText}
    />,
  );
  const file = new File(["csv"], "review.csv");
  Object.defineProperty(file, "arrayBuffer", { value: () => pending });
  const input = view.container.querySelector('input[accept^=".csv"]');
  if (!input) throw new Error("Missing review file input");
  fireEvent.change(input, {
    target: { files: [file] },
  });
  view.unmount();
  await act(async () => resolve(new ArrayBuffer(0)));
  expect(onImportReviewText).not.toHaveBeenCalled();
});

function defineFixture<T>(value: unknown): T {
  return value as T;
}
