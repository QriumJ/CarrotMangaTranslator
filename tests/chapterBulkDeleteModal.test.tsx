import { LibraryTree } from "../src/renderer/src/components/LibraryTree";
// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import { ChapterBulkDeleteSelection } from "../src/renderer/src/components/ChapterBulkDeleteSelection";
import { ConfirmModal } from "../src/renderer/src/components/ConfirmModal";
import { LibraryEditModals } from "../src/renderer/src/components/LibraryEditModals";
import { useChapterBulkDelete } from "../src/renderer/src/hooks/useChapterBulkDelete";
import { useConfirmDialog } from "../src/renderer/src/hooks/useConfirmDialog";
import { useLibraryRenameActions } from "../src/renderer/src/hooks/useLibraryRenameActions";
import type {
  ChapterSnapshot,
  DeleteChaptersRequest,
  LibraryIndex,
} from "../src/shared/libraryTypes";

const TS = "2026-01-01T00:00:00.000Z";
const WORK = "11111111-1111-4111-8111-111111111111";
const chapterId = (index: number) =>
  `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`;

function makeLibrary(count: number, removed: string[] = []): LibraryIndex {
  const ids = Array.from({ length: count }, (_, index) =>
    chapterId(index + 1),
  ).filter((id) => !removed.includes(id));
  return {
    workOrder: [WORK],
    works: [
      {
        id: WORK,
        title: "누적 작품",
        chapterOrder: ids,
        createdAt: TS,
        updatedAt: TS,
        chapters: ids.map((id) => ({
          id,
          workId: WORK,
          title: `${Number(id.slice(-12))}권`,
          status: "completed",
          pageCount: 10,
          createdAt: TS,
          updatedAt: TS,
        })),
      },
    ],
  };
}

const deleteChapters = vi.fn();
const getLibrary = vi.fn();
const pushStatus = vi.fn();
const clearCurrentChapter = vi.fn();
const saveNow = vi.fn(async () => undefined);
const openContext = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  window.mangaApi = createTestMangaGatewayStub({ deleteChapters, getLibrary });
});

afterEach(() => {
  cleanup();
  window.mangaApi = createTestMangaGatewayStub();
});

function Harness({
  currentChapter = null,
}: {
  currentChapter?: ChapterSnapshot | null;
}) {
  const [library, setLibrary] = React.useState(() => makeLibrary(5));
  const confirm = useConfirmDialog();
  const controller = useChapterBulkDelete({
    askConfirm: confirm.askConfirm,
    clearCurrentChapter,
    currentChapter,
    dirty: true,
    library,
    pushStatus,
    saveNow,
    setLibrary,
  });
  return (
    <>
      <button onClick={() => controller.open(WORK)}>열기</button>
      {controller.work ? (
        <ChapterBulkDeleteSelection
          controller={{ ...controller, work: controller.work }}
          currentChapterId={currentChapter?.id ?? null}
          jobActive={false}
        />
      ) : null}
      {confirm.confirmDialog ? (
        <ConfirmModal
          {...confirm.confirmDialog}
          onConfirm={() => confirm.resolveConfirmDialog(true)}
          onCancel={() => confirm.resolveConfirmDialog(false)}
        />
      ) : null}
    </>
  );
}

function checkbox(title: string): HTMLInputElement {
  return screen.getByRole("checkbox", { name: `${title} 선택` });
}

async function openDialog(): Promise<HTMLElement> {
  fireEvent.click(screen.getByText("열기"));
  return screen.findByRole("region", { name: "화 골라서 삭제" });
}

describe("chapter bulk delete", () => {
  it("opens the selected work context even when no chapter is open", () => {
    render(<LibraryEditHarness count={0} />);
    fireEvent.click(screen.getByRole("button", { name: "누적 작품 작업" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "용어/기억" }));
    expect(openContext).toHaveBeenCalledWith(WORK);
  });

  it("starts selection directly in the work list and leaves rename separate", async () => {
    render(<LibraryEditHarness />);
    fireEvent.click(screen.getByRole("button", { name: "누적 작품 작업" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "화 선택" }));
    const picker = await screen.findByRole("region", {
      name: "화 골라서 삭제",
    });
    expect(screen.queryByRole("dialog")).toBe(null);
    expect(within(picker).getAllByRole("checkbox")).toHaveLength(5);
    fireEvent.click(within(picker).getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("region", { name: "화 골라서 삭제" })).toBe(null);
    expect(deleteChapters).not.toHaveBeenCalled();
  });

  it("does not offer a work-wide picker while renaming a chapter", () => {
    render(<LibraryEditHarness />);
    fireEvent.click(screen.getByRole("button", { name: "화 열기" }));
    expect(screen.getByRole("dialog", { name: "화 이름 변경" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "화 골라서 삭제…" })).toBe(
      null,
    );
  });

  it("does not offer chapter deletion for an empty work", () => {
    render(<LibraryEditHarness count={0} />);
    fireEvent.click(screen.getByRole("button", { name: "작품 열기" }));
    expect(screen.getByRole("dialog", { name: "작품 이름 변경" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "화 골라서 삭제…" })).toBe(
      null,
    );
  });

  it("selects a Shift range and reports the selection size", async () => {
    render(<Harness />);
    const dialog = await openDialog();
    expect(within(dialog).getByText("5화 중 0화 선택 · 0페이지")).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: "선택한 0화 삭제" }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(checkbox("2권"));
    fireEvent.click(checkbox("4권"), { shiftKey: true });
    expect(
      ["1권", "2권", "3권", "4권", "5권"].map(
        (title) => checkbox(title).checked,
      ),
    ).toEqual([false, true, true, true, false]);
    expect(within(dialog).getByText("5화 중 3화 선택 · 30페이지")).toBeTruthy();
    fireEvent.click(checkbox("3권"), { shiftKey: true });
    expect(checkbox("2권").checked).toBe(false);
    expect(checkbox("3권").checked).toBe(false);
    expect(checkbox("4권").checked).toBe(true);
  });

  it("never calls the gateway when the confirmation is cancelled", async () => {
    render(<Harness />);
    await openDialog();
    fireEvent.click(checkbox("1권"));
    fireEvent.click(screen.getByRole("button", { name: "선택한 1화 삭제" }));
    fireEvent.click(
      within(
        await screen.findByRole("dialog", { name: "화 1개 삭제" }),
      ).getByRole("button", { name: "취소" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "화 1개 삭제" })).toBe(null),
    );
    expect(deleteChapters).not.toHaveBeenCalled();
    expect(checkbox("1권").checked).toBe(true);
  });

  it("deletes the selection, clears an open deleted chapter, and closes", async () => {
    deleteChapters.mockImplementation(
      async (request: DeleteChaptersRequest) => ({
        library: makeLibrary(5, request.chapterIds),
        deletedChapterIds: request.chapterIds,
        failures: [],
      }),
    );
    render(
      <Harness
        currentChapter={{
          id: chapterId(1),
          workId: WORK,
          title: "1권",
          sourceKind: "images",
          status: "completed",
          pageOrder: [],
          pages: [],
          createdAt: TS,
          updatedAt: TS,
        }}
      />,
    );
    const dialog = await openDialog();
    expect(within(dialog).getByText("열려 있음")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "전체 선택" }));
    fireEvent.click(checkbox("5권"));
    fireEvent.click(screen.getByRole("button", { name: "선택한 4화 삭제" }));
    const confirm = await screen.findByRole("dialog", { name: "화 4개 삭제" });
    expect(within(confirm).getByText("1권, 2권, 3권 외 1화")).toBeTruthy();
    fireEvent.click(within(confirm).getByRole("button", { name: "4화 삭제" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "화 골라서 삭제" })).toBe(
        null,
      ),
    );
    expect(saveNow).toHaveBeenCalledOnce();
    expect(deleteChapters).toHaveBeenCalledWith({
      workId: WORK,
      chapterIds: [1, 2, 3, 4].map(chapterId),
      removeCustomOutputs: false,
    });
    expect(clearCurrentChapter).toHaveBeenCalledOnce();
    expect(pushStatus).toHaveBeenCalledWith(
      "4화를 삭제했습니다. 작품과 용어/기억은 유지됩니다.",
    );
  });

  it("keeps the dialog open with only failed chapters selected after a partial failure", async () => {
    deleteChapters.mockImplementation(async () => ({
      library: makeLibrary(5, [chapterId(1)]),
      deletedChapterIds: [chapterId(1)],
      failures: [
        { chapterId: chapterId(2), title: "2권", message: "C:/secret/path" },
      ],
    }));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    render(<Harness />);
    const dialog = await openDialog();
    fireEvent.click(checkbox("1권"));
    fireEvent.click(checkbox("2권"));
    fireEvent.click(screen.getByRole("button", { name: "선택한 2화 삭제" }));
    fireEvent.click(await screen.findByRole("button", { name: "2화 삭제" }));
    expect(
      await within(dialog).findByText(
        "1화를 삭제했고 1화는 삭제하지 못했습니다",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("C:/secret/path")).toBe(null);
    expect(within(dialog).getByText("삭제 실패")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "1권 선택" })).toBe(null);
    expect(checkbox("2권").checked).toBe(true);
    expect(within(dialog).getByText("4화 중 1화 선택 · 10페이지")).toBeTruthy();
    consoleError.mockRestore();
  });

  it("reloads the library and explains when the whole request fails", async () => {
    deleteChapters.mockRejectedValue(new Error("selection changed"));
    getLibrary.mockResolvedValue(makeLibrary(5, [chapterId(5)]));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    render(<Harness />);
    const dialog = await openDialog();
    fireEvent.click(checkbox("5권"));
    fireEvent.click(screen.getByRole("button", { name: "선택한 1화 삭제" }));
    fireEvent.click(await screen.findByRole("button", { name: "1화 삭제" }));
    expect(
      await within(dialog).findByText("선택한 화를 삭제하지 못했습니다"),
    ).toBeTruthy();
    expect(getLibrary).toHaveBeenCalledOnce();
    expect(pushStatus).toHaveBeenCalledWith("선택한 화를 삭제하지 못했습니다.");
    await waitFor(() =>
      expect(screen.queryByRole("checkbox", { name: "5권 선택" })).toBe(null),
    );
    consoleError.mockRestore();
  });
});

function LibraryEditHarness({ count = 5 }: { count?: number }) {
  const [library, setLibrary] = React.useState(() => makeLibrary(count));
  const currentChapterRef = React.useRef<ChapterSnapshot | null>(null);
  const actions = useLibraryRenameActions({
    askConfirm: async () => false,
    applyChapter: vi.fn(),
    clearCurrentChapter,
    clearDirtyTracking: vi.fn(),
    currentChapter: null,
    currentChapterRef,
    dirty: false,
    library,
    pushStatus,
    resetSaveBaseline: vi.fn(),
    saveNow,
    setCurrentChapter: vi.fn(),
    setLibrary,
    setSelectedBlockId: vi.fn(),
    setSelectedPageId: vi.fn(),
  });
  return (
    <>
      <button onClick={() => actions.renameWork(WORK)}>작품 열기</button>
      <button onClick={() => actions.renameChapter(chapterId(1))}>
        화 열기
      </button>
      <LibraryTree
        collapsed={false}
        otherPanelCollapsed={false}
        library={library}
        currentChapterId={null}
        jobActive={false}
        onOpenChapter={() => {}}
        onRenameWork={actions.renameWork}
        onRenameChapter={actions.renameChapter}
        onReorderChapter={() => {}}
        onToggleOtherPanel={() => {}}
        contextActions={{
          selection: actions.chapterBulkDelete,
          openContext,
          deleteTarget: (target) => void actions.deleteRenameTarget(target),
        }}
      />
      <LibraryEditModals
        onCancelRename={() => actions.setRenameTarget(null)}
        onSubmitRename={(title) => void actions.submitRename(title)}
        renameBusy={actions.renameBusy}
        renameTarget={actions.renameTarget}
      />
    </>
  );
}
