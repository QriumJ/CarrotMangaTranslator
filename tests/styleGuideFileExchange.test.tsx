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
import type { NotificationPort } from "../src/renderer/src/lib/notificationPort";
import { StyleGuideModal } from "../src/renderer/src/components/StyleGuideModal";
import type { ChapterSnapshot } from "../src/shared/libraryTypes";
import type { WorkStyleGuide } from "../src/shared/workContextTypes";
import { WORK_GLOSSARY_FILE_FORMAT } from "../src/shared/workGlossaryFile";

const WORK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const TS = "2026-01-01T00:00:00.000Z";

const gateway = {
  getChapterStoryMemory: vi.fn(),
  getWorkContextUsage: vi.fn(),
  getWorkResearchTitle: vi.fn(),
  getWorkStyleGuide: vi.fn(),
  openWorkGlossaryFile: vi.fn(),
  saveChapterStoryMemory: vi.fn(),
  saveWorkGlossaryFile: vi.fn(),
  saveWorkStyleGuide: vi.fn(),
};
const notify: NotificationPort = {
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warn: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  window.mangaApi = createTestMangaGatewayStub(gateway);
  gateway.getWorkStyleGuide.mockResolvedValue(makeGuide());
  gateway.getChapterStoryMemory.mockResolvedValue({
    schemaVersion: 1,
    workId: WORK_ID,
    chapterId: CHAPTER_ID,
    pages: [],
    updatedAt: TS,
  });
  gateway.getWorkResearchTitle.mockResolvedValue(null);
  gateway.getWorkContextUsage.mockResolvedValue({
    workId: WORK_ID,
    glossary: [],
    characters: [],
  });
  gateway.saveWorkStyleGuide.mockImplementation(async (guide) => guide);
  gateway.saveChapterStoryMemory.mockImplementation(async (memory) => memory);
  gateway.saveWorkGlossaryFile.mockResolvedValue({
    saved: true,
    path: "C:/backup/glossary.json",
  });
});

afterEach(() => {
  cleanup();
  window.mangaApi = createTestMangaGatewayStub();
});

describe("style guide term file exchange", () => {
  it("replaces the editor with one import review and restores its draft and focus on cancel", async () => {
    gateway.openWorkGlossaryFile.mockResolvedValue({
      path: "C:/backup/glossary.json",
      content: makeImportFile(),
    });
    renderModal();
    fireEvent.change(await screen.findByDisplayValue("마왕"), {
      target: { value: "초안 마왕" },
    });
    fireEvent.click(screen.getByRole("button", { name: "가져오기" }));
    const review = await screen.findByRole("dialog", {
      name: "용어 파일 가져오기",
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    fireEvent.click(within(review).getByRole("button", { name: "취소" }));
    expect(await screen.findByDisplayValue("초안 마왕")).toBeTruthy();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "가져오기" }),
      ),
    );
    expect(gateway.saveWorkStyleGuide).not.toHaveBeenCalled();
  });

  it("exports the shown glossary and characters as a portable file", async () => {
    renderModal();
    await screen.findByDisplayValue("魔王");
    fireEvent.click(screen.getByRole("button", { name: "내보내기" }));
    await waitFor(() =>
      expect(gateway.saveWorkGlossaryFile).toHaveBeenCalled(),
    );
    const request = gateway.saveWorkGlossaryFile.mock.calls[0]?.[0] as {
      defaultName: string;
      content: string;
    };
    expect(request.defaultName).toBe("테스트 작품 용어집");
    const file = JSON.parse(request.content);
    expect(file).toMatchObject({
      format: WORK_GLOSSARY_FILE_FORMAT,
      version: 1,
      workTitle: "테스트 작품",
      glossary: [
        { source: "魔王", target: "마왕", category: "term" },
        { source: "聖剣", target: "성검", category: "term" },
      ],
      characters: [],
    });
    expect(notify.success).toHaveBeenCalledWith(
      "용어 2개와 캐릭터 0개를 파일로 내보냈습니다.",
    );
  });

  it("reviews an import, keeps existing translations by default, and saves only on Save", async () => {
    gateway.openWorkGlossaryFile.mockResolvedValue({
      path: "C:/backup/다른 작품 용어집.json",
      content: makeImportFile(),
    });
    renderModal();
    await screen.findByDisplayValue("魔王");
    fireEvent.click(screen.getByRole("button", { name: "가져오기" }));
    const review = await screen.findByRole("dialog", {
      name: "용어 파일 가져오기",
    });
    expect(within(review).getByText("다른 작품 용어집.json")).toBeTruthy();
    expect(within(review).getByText("내보낸 작품: 다른 작품")).toBeTruthy();
    expect(within(review).getByText("마왕")).toBeTruthy();
    expect(within(review).getByText("대마왕")).toBeTruthy();
    const apply = within(review).getByRole("button", {
      name: "초안에 반영 (1개)",
    });
    fireEvent.click(apply);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "용어 파일 가져오기" })).toBe(
        null,
      ),
    );
    expect(await screen.findByDisplayValue("勇者")).toBeTruthy();
    expect(screen.getByDisplayValue("마왕")).toBeTruthy();
    expect(gateway.saveWorkStyleGuide).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(gateway.saveWorkStyleGuide).toHaveBeenCalled());
    const saved = gateway.saveWorkStyleGuide.mock
      .calls[0]?.[0] as WorkStyleGuide;
    expect(saved.glossary.map((entry) => [entry.source, entry.target])).toEqual(
      [
        ["魔王", "마왕"],
        ["聖剣", "성검"],
        ["勇者", "용사"],
      ],
    );
    expect(saved.rules).toEqual(makeGuide().rules);
  });

  it("replaces a differing translation only when the user chooses the file", async () => {
    gateway.openWorkGlossaryFile.mockResolvedValue({
      path: "C:/backup/glossary.json",
      content: makeImportFile(),
    });
    renderModal();
    await screen.findByDisplayValue("魔王");
    fireEvent.click(screen.getByRole("button", { name: "가져오기" }));
    const review = await screen.findByRole("dialog", {
      name: "용어 파일 가져오기",
    });
    fireEvent.click(
      within(review).getByRole("radio", { name: "파일 번역으로 바꾸기" }),
    );
    fireEvent.click(
      within(review).getByRole("button", { name: "초안에 반영 (2개)" }),
    );
    expect(await screen.findByDisplayValue("대마왕")).toBeTruthy();
    expect(screen.queryByDisplayValue("마왕")).toBe(null);
  });

  it.each([
    [
      { path: "C:/x.json", content: "{oops" },
      "JSON 형식이 아닌 파일입니다. 내보내기로 만든 용어 파일을 선택해 주세요.",
    ],
    [
      { path: "C:/x.json", tooLarge: true },
      "용어 파일이 16MiB를 넘어 열지 않았습니다.",
    ],
  ])(
    "explains an unusable file without touching the draft",
    async (opened, message) => {
      gateway.openWorkGlossaryFile.mockResolvedValue(opened);
      renderModal();
      await screen.findByDisplayValue("魔王");
      fireEvent.click(screen.getByRole("button", { name: "가져오기" }));
      await waitFor(() => expect(notify.error).toHaveBeenCalledWith(message));
      expect(screen.queryByRole("dialog", { name: "용어 파일 가져오기" })).toBe(
        null,
      );
      expect(screen.getByDisplayValue("마왕")).toBeTruthy();
    },
  );

  it("does nothing when the file dialog is cancelled", async () => {
    gateway.openWorkGlossaryFile.mockResolvedValue(null);
    renderModal();
    await screen.findByDisplayValue("魔王");
    fireEvent.click(screen.getByRole("button", { name: "가져오기" }));
    await waitFor(() =>
      expect(gateway.openWorkGlossaryFile).toHaveBeenCalled(),
    );
    expect(notify.error).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "용어 파일 가져오기" })).toBe(
      null,
    );
  });
});

function renderModal(): void {
  render(
    <StyleGuideModal
      chapter={makeChapter()}
      workTitle="테스트 작품"
      notificationPort={notify}
      settings={null}
      onClose={vi.fn()}
    />,
  );
}

function makeImportFile(): string {
  return JSON.stringify({
    format: WORK_GLOSSARY_FILE_FORMAT,
    version: 1,
    exportedAt: TS,
    workTitle: "다른 작품",
    glossary: [
      { source: "魔王", target: "대마왕", category: "term", enabled: true },
      { source: "聖剣", target: "성검", category: "term", enabled: true },
      { source: "勇者", target: "용사", category: "character", enabled: true },
    ],
    characters: [],
  });
}

function makeGuide(): WorkStyleGuide {
  return {
    schemaVersion: 1,
    workId: WORK_ID,
    glossary: [
      {
        id: "term-1",
        source: "魔王",
        target: "마왕",
        category: "term",
        enabled: true,
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: "term-2",
        source: "聖剣",
        target: "성검",
        category: "term",
        enabled: true,
        createdAt: TS,
        updatedAt: TS,
      },
    ],
    characters: [],
    rules: {
      prompt: "고유명사는 한국식 발음으로 옮기지 않는다.",
      honorifics: "adapt",
      sfxMode: "translate",
      defaultTone: "natural_korean",
    },
    createdAt: TS,
    updatedAt: TS,
  };
}

function makeChapter(): ChapterSnapshot {
  return {
    id: CHAPTER_ID,
    workId: WORK_ID,
    title: "1화",
    sourceKind: "images",
    status: "completed",
    pageOrder: [],
    pages: [],
    createdAt: TS,
    updatedAt: TS,
  };
}
