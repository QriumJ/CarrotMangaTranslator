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
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CreateImportRequest,
  CreateImportResult,
  ImportPreviewResult,
  ImportPreviewSession,
} from "../src/shared/importTypes";
import type { ChapterSnapshot, LibraryIndex } from "../src/shared/libraryTypes";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import { ImportModal } from "../src/renderer/src/components/ImportModal";
import { useImportShareActions } from "../src/renderer/src/hooks/useImportShareActions";
import type { ImportModalSubmit } from "../src/renderer/src/lib/importFlowTypes";
import {
  WORKSPACE_PREFERENCES_STORAGE_KEY,
  writeWorkspacePreference,
} from "../src/renderer/src/lib/workspacePreferences";

const TS = "2026-10-13T00:00:00.000Z";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.mangaApi = createTestMangaGatewayStub();
  vi.clearAllMocks();
});

describe("batch import selection", () => {
  it("selects and clears every candidate and keeps an empty choice unsubmittable", () => {
    renderModal();
    const submit = screen.getByRole("button", { name: "추가 후 번역" });
    expect(screen.getByText("3개 중 3개 화 선택")).toBeTruthy();
    expect(screen.getByRole("button", { name: "전체 선택" })).toHaveProperty(
      "disabled",
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "전체 해제" }));
    expect(screen.getByText("3개 중 0개 화 선택")).toBeTruthy();
    expect(checkedDrafts()).toEqual([false, false, false]);
    expect(submit).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "전체 선택" }));
    expect(checkedDrafts()).toEqual([true, true, true]);
    expect(submit).toHaveProperty("disabled", false);
  });

  it("freezes the bulk actions and options while busy", () => {
    renderModal({ busy: true });
    expect(screen.getByRole("button", { name: "전체 해제" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(
      screen.getByRole("checkbox", { name: "가져온 뒤 번역 설정 열기" }),
    ).toHaveProperty("disabled", true);
  });
});

describe("remembered batch import options", () => {
  it("defaults to opening translation settings and not skipping duplicates", () => {
    const { onSubmit } = renderModal();
    expect(openTranslationBox().checked).toBe(true);
    expect(skipBox()).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /기존 작품에 추가/ }));
    expect(skipBox()?.checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "추가 후 번역" }));
    const payload = onSubmit.mock.lastCall?.[0];
    expect(payload?.openTranslationAfterImport).toBe(true);
    expect(payload).not.toHaveProperty("skipDuplicateChapterTitles");
  });

  it("restores both choices on the next opening", () => {
    writeWorkspacePreference("openTranslationAfterImport", false);
    writeWorkspacePreference("skipDuplicateChapterTitles", true);
    const { onSubmit } = renderModal({ currentWorkId: "work-1" });

    expect(openTranslationBox().checked).toBe(false);
    expect(skipBox()?.checked).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "보관함에 추가" }));
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        openTranslationAfterImport: false,
        skipDuplicateChapterTitles: true,
        target: { mode: "existing", workId: "work-1" },
      }),
    );
  });

  it("stores a changed choice for later openings", () => {
    renderModal();
    fireEvent.click(openTranslationBox());
    expect(
      JSON.parse(
        window.localStorage.getItem(WORKSPACE_PREFERENCES_STORAGE_KEY) ?? "{}",
      ).openTranslationAfterImport,
    ).toBe(false);
  });

  it("counts duplicates from edited titles and marks the skipped candidates", () => {
    writeWorkspacePreference("skipDuplicateChapterTitles", true);
    renderModal({ currentWorkId: "work-1" });
    expect(screen.getByText("1개 건너뜀 · 2개 가져오기")).toBeTruthy();
    expect(screen.getAllByText("중복")).toHaveLength(1);

    fireEvent.change(screen.getByDisplayValue("2화"), {
      target: { value: " 1화 " },
    });
    expect(screen.getByText("2개 건너뜀 · 1개 가져오기")).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue("3화"), {
      target: { value: "1화" },
    });
    expect(screen.getByText("3개 모두 건너뜀")).toBeTruthy();
    expect(screen.getByRole("button", { name: "추가 후 번역" })).toHaveProperty(
      "disabled",
      false,
    );

    fireEvent.click(screen.getByRole("radio", { name: "새 작품 만들기" }));
    expect(skipBox()).toBeNull();
    expect(screen.queryByText("중복")).toBeNull();
  });

  it("shows where the source path is kept for multi-folder candidates", () => {
    renderModal();
    const input = screen.getByDisplayValue("1화");
    const tooltipId = input.getAttribute("aria-describedby");
    if (!tooltipId) throw new Error("Missing source path description");
    expect(document.getElementById(tooltipId)?.textContent).toBe("26/0001.png");
    expect(document.getElementById(tooltipId)?.hidden).toBe(true);
    fireEvent.focus(input);
    expect(document.getElementById(tooltipId)?.hidden).toBe(false);
  });
});

describe("batch import completion", () => {
  it("keeps the renderer-only choice out of the import request", async () => {
    const createImport = createImportStub();
    const { actions } = await submit(createImport, {
      ...existingPayload(),
      openTranslationAfterImport: true,
      skipDuplicateChapterTitles: true,
    });
    const request = createImport.mock.calls[0]?.[0];
    expect(request).not.toHaveProperty("openTranslationAfterImport");
    expect(request?.skipDuplicateChapterTitles).toBe(true);
    expect(actions.openTranslateOptions).toHaveBeenCalledWith("work-all");
  });

  it("never sends the duplicate rule for a new work", async () => {
    const createImport = createImportStub();
    await submit(createImport, {
      target: { mode: "new", title: "새 작품" },
      selections: SELECTIONS,
      skipDuplicateChapterTitles: true,
    });
    expect(createImport.mock.calls[0]?.[0]).not.toHaveProperty(
      "skipDuplicateChapterTitles",
    );
  });

  it("finishes an all-skipped import without navigation or translation settings", async () => {
    const { actions } = await submit(
      async () => ({
        workId: "work-1",
        chapterIds: [],
        skippedChapters: [
          { draftId: "draft-1", title: "1화" },
          { draftId: "draft-2", title: "2화" },
        ],
      }),
      { ...existingPayload(), skipDuplicateChapterTitles: true },
    );
    expect(actions.applyChapter).not.toHaveBeenCalled();
    expect(actions.openTranslateOptions).not.toHaveBeenCalled();
    expect(actions.setImportModalOpen).not.toHaveBeenCalledWith(true);
    expect(actions.refreshLibrary).toHaveBeenCalledTimes(1);
    expect(actions.pushStatus).toHaveBeenCalledWith("중복 2개 건너뜀");
  });

  it("summarizes a partial import and opens the first imported chapter", async () => {
    const { actions } = await submit(
      async () => ({
        ...importResult(["chapter-2"]),
        skippedChapters: [{ draftId: "draft-1", title: "1화" }],
      }),
      { ...existingPayload(), skipDuplicateChapterTitles: true },
    );
    expect(actions.applyChapter).toHaveBeenCalledWith(
      expect.objectContaining({ id: "chapter-2" }),
      "1개 추가 · 중복 1개 건너뜀",
    );
    expect(actions.openTranslateOptions).toHaveBeenCalledWith("work-all");
  });

  it("only imports when opening translation settings is turned off", async () => {
    const { actions } = await submit(async () => importResult(["chapter-2"]), {
      ...existingPayload(),
      openTranslationAfterImport: false,
    });
    expect(actions.applyChapter).toHaveBeenCalled();
    expect(actions.openTranslateOptions).not.toHaveBeenCalled();
  });
});

function renderModal({
  busy = false,
  currentWorkId = null,
}: { busy?: boolean; currentWorkId?: string | null } = {}) {
  const onSubmit = vi.fn<(payload: ImportModalSubmit) => void>();
  render(
    <ImportModal
      library={LIBRARY}
      currentWorkId={currentWorkId}
      preview={PREVIEW}
      busy={busy}
      onCancel={vi.fn()}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit };
}

function checkedDrafts(): boolean[] {
  return ["1화", "2화", "3화"].map(
    (title) =>
      (
        screen.getByRole("checkbox", {
          name: `${title} · 1페이지`,
        }) as HTMLInputElement
      ).checked,
  );
}

function openTranslationBox(): HTMLInputElement {
  return screen.getByRole("checkbox", {
    name: "가져온 뒤 번역 설정 열기",
  }) as HTMLInputElement;
}

function skipBox(): HTMLInputElement | null {
  return screen.queryByRole("checkbox", {
    name: "이미 있는 제목의 화는 건너뛰기",
  }) as HTMLInputElement | null;
}

async function submit(
  createImport: (request: CreateImportRequest) => Promise<CreateImportResult>,
  payload: ImportModalSubmit,
) {
  window.mangaApi = createTestMangaGatewayStub({ createImport });
  const actions = {
    applyChapter: vi.fn(),
    openTranslateOptions: vi.fn(),
    pushStatus: vi.fn(),
    refreshLibrary: vi.fn(async () => undefined),
    setImportModalOpen: vi.fn(),
  };
  const { result } = renderHook(() =>
    useImportShareActions({
      ...actions,
      askConfirm: vi.fn(async () => true),
      dirty: false,
      getNavigationKey: () => "chapter-1:page-1",
      importPreview: SESSION,
      resetWorkspaceHistory: vi.fn(),
      saveNow: vi.fn(async () => undefined),
      setImportBusy: vi.fn(),
      setImportPreview: vi.fn(),
      setShareExportBusy: vi.fn(),
      setShareExportDraft: vi.fn(),
      setShareExportOpen: vi.fn(),
      setShareImportBusy: vi.fn(),
      setShareImportDraft: vi.fn(),
      setShareImportPreview: vi.fn(),
      setTranslationSourceOpen: vi.fn(),
      setWebImportOpen: vi.fn(),
      shareImportPreview: null,
    }),
  );
  await act(async () => result.current.submitImport(payload));
  return { actions };
}

function createImportStub() {
  return vi.fn<(request: CreateImportRequest) => Promise<CreateImportResult>>(
    async () => importResult(["chapter-2"]),
  );
}

function existingPayload(): ImportModalSubmit {
  return {
    target: { mode: "existing", workId: "work-1" },
    selections: SELECTIONS,
  };
}

function importResult(chapterIds: string[]): CreateImportResult {
  return { workId: "work-1", chapterIds, openedChapter: chapter("chapter-2") };
}

function chapter(id: string): ChapterSnapshot {
  return {
    id,
    workId: "work-1",
    title: "2화",
    sourceKind: "images",
    status: "idle",
    pageOrder: [],
    pages: [],
    createdAt: TS,
    updatedAt: TS,
  };
}

const SELECTIONS = [
  { draftId: "draft-1", title: "1화", enabled: true },
  { draftId: "draft-2", title: "2화", enabled: true },
];

const LIBRARY: LibraryIndex = {
  workOrder: ["work-1"],
  works: [
    {
      id: "work-1",
      title: "기존 작품",
      chapterOrder: ["existing-1"],
      chapters: [
        {
          id: "existing-1",
          workId: "work-1",
          title: "1화",
          status: "idle",
          createdAt: TS,
          updatedAt: TS,
          pageCount: 3,
        },
      ],
      createdAt: TS,
      updatedAt: TS,
    },
  ],
};

const PREVIEW: ImportPreviewResult = {
  mode: "batch",
  sourceKind: "images",
  suggestedWorkTitle: "새 작품",
  chapters: ["1화", "2화", "3화"].map((title, index) => ({
    draftId: `draft-${index + 1}`,
    title,
    sourceKind: "images" as const,
    pages: [
      {
        name: "0001.png",
        sourcePath: `C:/source/${index}/0001.png`,
        sourceKind: "file" as const,
        sourceFileName: "0001.png",
        sourceRelativePath: index === 0 ? "26/0001.png" : undefined,
      },
    ],
  })),
};

const SESSION: ImportPreviewSession = { ...PREVIEW, previewId: "preview-1" };
