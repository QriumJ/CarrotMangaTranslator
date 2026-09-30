// @vitest-environment jsdom

import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import type {
  ChapterSnapshot,
  LibraryIndex,
  MangaPage,
} from "../src/shared/libraryTypes";

const openChapter = vi.fn<(chapterId: string) => Promise<ChapterSnapshot>>();

beforeEach(() => {
  window.mangaApi = createTestMangaGatewayStub({
    getPageImageDataUrl: vi.fn(() => Promise.resolve("mgt-image://token")),
    openChapter: (chapterId: string) => openChapter(chapterId),
  });
});

import { AutoInpaintingOptionsModal } from "../src/renderer/src/components/AutoInpaintingOptionsModal";

const WORK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const SECOND_CHAPTER_ID = "33333333-3333-4333-8333-333333333333";
const TS = "2026-01-01T00:00:00.000Z";

function makePage(id: string): MangaPage {
  return {
    id,
    name: `${id}.png`,
    imagePath: `C:/${id}.png`,
    dataUrl: "",
    width: 100,
    height: 150,
    blocks: [],
    analysisStatus: "completed",
    createdAt: TS,
    updatedAt: TS,
  };
}

function makeChapter(
  id = CHAPTER_ID,
  pages = [makePage("p1"), makePage("p2")],
): ChapterSnapshot {
  return {
    id,
    workId: WORK_ID,
    title: id === CHAPTER_ID ? "1화" : "2화",
    sourceKind: "images",
    status: "completed",
    pageOrder: pages.map((page) => page.id),
    pages,
    createdAt: TS,
    updatedAt: TS,
  };
}

function makeLibrary(currentPageCount = 2): LibraryIndex {
  return {
    workOrder: [WORK_ID],
    works: [
      {
        id: WORK_ID,
        title: "테스트 작품",
        chapterOrder: [CHAPTER_ID, SECOND_CHAPTER_ID],
        createdAt: TS,
        updatedAt: TS,
        chapters: [
          {
            id: CHAPTER_ID,
            workId: WORK_ID,
            title: "1화",
            status: "completed",
            createdAt: TS,
            updatedAt: TS,
            pageCount: currentPageCount,
          },
          {
            id: SECOND_CHAPTER_ID,
            workId: WORK_ID,
            title: "2화",
            status: "completed",
            createdAt: TS,
            updatedAt: TS,
            pageCount: 2,
          },
        ],
      },
    ],
  };
}

async function renderModal(
  initialScope: React.ComponentProps<
    typeof AutoInpaintingOptionsModal
  >["initialScope"] = "select",
  currentChapter = makeChapter(),
) {
  const onStart = vi.fn();
  const onClose = vi.fn();
  render(
    <AutoInpaintingOptionsModal
      chapter={currentChapter}
      currentPageId="p2"
      initialScope={initialScope}
      library={makeLibrary(currentChapter.pages.length)}
      onStart={onStart}
      onClose={onClose}
    />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  return { onStart, onClose };
}

afterEach(() => {
  cleanup();
  window.mangaApi = createTestMangaGatewayStub();
  vi.clearAllMocks();
});

describe("AutoInpaintingOptionsModal", () => {
  it("defaults to the current page and submits all/page-set selections", async () => {
    const { onStart, onClose } = await renderModal();

    expect(
      screen.getByRole("dialog", { name: "지울 페이지 선택" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "자동 지우기 시작" }));

    expect(onStart).toHaveBeenCalledWith(
      [{ chapterId: CHAPTER_ID, mode: "page-set", pageIds: ["p2"] }],
      {
        bubbleLayout: {
          enabled: true,
          policy: "balanced",
        },
      },
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses fixed current/all scopes and can disable bubble postprocess", async () => {
    const current = await renderModal("current");
    expect(screen.getByText("현재 페이지만 지웁니다.")).toBeTruthy();
    const bubbleToggle = screen.getByRole("switch", {
      name: /인페인팅 후 말풍선 맞춤/,
    });
    expect(bubbleToggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(bubbleToggle);
    fireEvent.click(screen.getByRole("button", { name: "자동 지우기 시작" }));
    expect(current.onStart).toHaveBeenCalledWith(
      [{ chapterId: CHAPTER_ID, mode: "page-set", pageIds: ["p2"] }],
      {
        bubbleLayout: {
          enabled: false,
          policy: "balanced",
        },
      },
    );

    cleanup();
    const all = await renderModal("all");
    expect(screen.getByText("현재 화의 전체 2페이지를 지웁니다.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "전체 선택" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "자동 지우기 시작" }));
    expect(all.onStart).toHaveBeenCalledWith(
      [{ chapterId: CHAPTER_ID, mode: "all" }],
      {
        bubbleLayout: {
          enabled: true,
          policy: "balanced",
        },
      },
    );
  });

  it("supports whole-work and clear quick actions", async () => {
    const { onStart } = await renderModal();

    fireEvent.click(screen.getByRole("button", { name: "전체 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "자동 지우기 시작" }));
    expect(onStart).toHaveBeenCalledWith(
      [
        { chapterId: CHAPTER_ID, mode: "all" },
        { chapterId: SECOND_CHAPTER_ID, mode: "all" },
      ],
      {
        bubbleLayout: {
          enabled: true,
          policy: "balanced",
        },
      },
    );

    cleanup();
    await renderModal();
    fireEvent.click(screen.getByRole("button", { name: "전체 해제" }));
    expect(
      screen.getByRole("button", { name: "자동 지우기 시작" }),
    ).toHaveProperty("disabled", true);
  });

  it("uses the shared Shift range and submits the resulting binary page set", async () => {
    const { onStart } = await renderModal(
      "select",
      makeChapter(CHAPTER_ID, ["p1", "p2", "p3", "p4"].map(makePage)),
    );
    const page = (id: string) =>
      screen.getByRole("checkbox", { name: new RegExp(`${id}\\.png`) });
    expect(page("p2").closest("label")?.getAttribute("aria-current")).toBe(
      "page",
    );

    fireEvent.click(page("p1"));
    fireEvent.click(page("p4"), { shiftKey: true });
    for (const id of ["p1", "p2", "p3", "p4"]) {
      expect(page(id).getAttribute("aria-checked")).toBe("true");
    }
    fireEvent.click(page("p4"));
    fireEvent.click(page("p2"), { shiftKey: true });
    fireEvent.click(page("p3"), { ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "자동 지우기 시작" }));
    expect(onStart).toHaveBeenCalledWith(
      [{ chapterId: CHAPTER_ID, mode: "page-set", pageIds: ["p1", "p3"] }],
      expect.anything(),
    );
  });

  it("does not extend a Shift range into another chapter", async () => {
    openChapter.mockResolvedValue(
      makeChapter(SECOND_CHAPTER_ID, [makePage("p3"), makePage("p4")]),
    );
    const { onStart } = await renderModal();
    fireEvent.click(screen.getByRole("checkbox", { name: /p1\.png/ }));
    fireEvent.click(screen.getByRole("button", { name: /2화/ }));
    const fourth = await screen.findByRole("checkbox", { name: /p4\.png/ });
    fireEvent.click(fourth, { shiftKey: true });
    expect(
      screen
        .getByRole("checkbox", { name: /p3\.png/ })
        .getAttribute("aria-checked"),
    ).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "자동 지우기 시작" }));
    expect(onStart).toHaveBeenCalledWith(
      [
        { chapterId: CHAPTER_ID, mode: "all" },
        { chapterId: SECOND_CHAPTER_ID, mode: "page-set", pageIds: ["p4"] },
      ],
      expect.anything(),
    );
  });

  it("loads pages for another chapter only when expanded", async () => {
    openChapter.mockResolvedValue(
      makeChapter(SECOND_CHAPTER_ID, [makePage("p3"), makePage("p4")]),
    );
    await renderModal();

    expect(openChapter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /2화/ }));

    await waitFor(() =>
      expect(openChapter).toHaveBeenCalledWith(SECOND_CHAPTER_ID),
    );
    expect(await screen.findByText("p3.png")).toBeTruthy();
  });
});
