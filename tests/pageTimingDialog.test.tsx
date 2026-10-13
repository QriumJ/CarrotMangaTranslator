/** @vitest-environment jsdom */

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MangaPage } from "../src/shared/libraryTypes";
import { PageList } from "../src/renderer/src/components/PageList";

afterEach(cleanup);

describe("page timing dialog", () => {
  it("opens from the timer button beside the filter and shows reconciled totals", () => {
    render(
      <PageList
        collapsed={false}
        otherPanelCollapsed={false}
        pages={PAGES}
        selectedPageId={null}
        jobActive={false}
        onSelect={vi.fn()}
        onRetranslate={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
        onToggleOtherPanel={vi.fn()}
      />,
    );

    const filter = screen.getByRole("button", {
      name: "페이지 상태 필터: 전체",
    });
    const timer = screen.getByRole("button", { name: "페이지 소요 시간" });
    expect(
      filter.compareDocumentPosition(timer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(timer);
    const dialog = screen.getByRole("dialog", { name: "페이지별 소요 시간" });
    expect(within(dialog).queryByRole("tab")).toBeNull();
    expect(within(dialog).getByText("기록된 단계 합계")).not.toBeNull();
    expect(within(dialog).getAllByText("5.00초").length).toBeGreaterThan(0);
    expect(within(dialog).getByText("001.jpg")).not.toBeNull();
    expect(
      within(dialog).getByRole("rowheader", { name: "원문 읽기 · OCR" }),
    ).not.toBeNull();
    expect(
      within(dialog).getByRole("rowheader", { name: "번역" }),
    ).not.toBeNull();
    expect(
      within(dialog).getByRole("rowheader", { name: "원문 제거" }),
    ).not.toBeNull();
    expect(within(dialog).queryByText("결과 정리")).toBeNull();
    expect(within(dialog).queryByText("말풍선")).toBeNull();
    // v1 snapshots have no session identity: keep both accessible independently.
    const history = within(dialog).getByRole("navigation", {
      name: "작업 실행 기록",
    });
    fireEvent.click(within(history).getAllByRole("button")[1]);
    expect(within(dialog).getByText("002.jpg")).not.toBeNull();
    expect(within(dialog).getAllByText("4.00초").length).toBeGreaterThan(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(
      screen.queryByRole("dialog", { name: "페이지별 소요 시간" }),
    ).toBeNull();
  });

  it("keeps two decimals for long interrupted timings", () => {
    render(
      <PageList
        collapsed={false}
        otherPanelCollapsed={false}
        pages={[longInterruptedPage()]}
        selectedPageId={null}
        jobActive={false}
        onSelect={vi.fn()}
        onRetranslate={vi.fn()}
        onRemove={vi.fn()}
        onReorder={vi.fn()}
        onToggleOtherPanel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "페이지 소요 시간" }));
    const dialog = screen.getByRole("dialog", { name: "페이지별 소요 시간" });
    expect(within(dialog).getAllByText("17분 40.23초").length).toBeGreaterThan(
      0,
    );
    expect(within(dialog).getAllByText("중단됨")).toHaveLength(2);
  });
});

function longInterruptedPage(): MangaPage {
  return {
    ...timedPage("long", "긴 페이지.jpg", {}),
    processingTiming: {
      version: 2,
      sessionId: "00000000-0000-4000-8000-000000000001",
      state: "interrupted",
      checkpoint: 7,
      measuredAt: "2026-08-27T00:17:40.230Z",
      stages: { preparing: 60_230, translation: 1_000_000 },
    },
  };
}

const PAGES: MangaPage[] = [
  timedPage("a", "001.jpg", {
    ocr: 1_600,
    translation: 2_600,
    typography: 800,
  }),
  timedPage("b", "002.jpg", {
    preparing: 600,
    translation: 1_400,
    inpainting: 1_600,
    bubbleLayout: 400,
  }),
];

function timedPage(
  id: string,
  name: string,
  stages: NonNullable<MangaPage["processingTiming"]>["stages"],
): MangaPage {
  return {
    id,
    name,
    imagePath: name,
    dataUrl:
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    width: 1,
    height: 1,
    blocks: [],
    analysisStatus: "completed",
    processingTiming: {
      version: 1,
      stages,
      measuredAt: "2026-08-27T00:00:00.000Z",
    },
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
  };
}
