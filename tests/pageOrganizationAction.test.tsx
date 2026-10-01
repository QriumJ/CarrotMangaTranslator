/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useLibraryReorderActions } from "../src/renderer/src/hooks/useLibraryReorderActions";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import { makeChapter } from "./fixtures/linkedWorkspace";
import { pageOrganizationRevision } from "../src/shared/pageOrganization";
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, "mangaApi");
});
function setup() {
  const chapter = makeChapter(3);
  const saved = {
    ...chapter,
    pages: [...chapter.pages].reverse(),
    pageOrder: [...chapter.pageOrder].reverse(),
  };
  const edit = vi.fn().mockResolvedValue(saved),
    open = vi.fn().mockResolvedValue(saved);
  window.mangaApi = createTestMangaGatewayStub({
    editPageOrganization: edit,
    openChapter: open,
  });
  const options = {
    applyChapter: vi.fn(),
    currentChapter: chapter,
    currentChapterRef: { current: chapter },
    dirty: true,
    saveNow: vi.fn().mockResolvedValue(undefined),
    library: { works: [], workOrder: [] },
    setCurrentChapter: vi.fn(),
    setLibrary: vi.fn(),
    setSelectedBlockId: vi.fn(),
    setSelectedPageId: vi.fn(),
    resetSaveBaseline: vi.fn(),
    clearDirtyTracking: vi.fn(),
    askConfirm: vi.fn(),
    pushStatus: vi.fn(),
    refreshLibrary: vi.fn().mockResolvedValue(undefined),
  };
  const hook = renderHook(() => useLibraryReorderActions(options));
  act(() => hook.result.current.openPageEditor());
  const request = {
    chapterId: chapter.id,
    revision: pageOrganizationRevision(chapter),
    pageIds: saved.pageOrder,
    names: [],
  };
  const editor = () => {
    const value = hook.result.current.pageEditor;
    if (!value) throw new Error("editor is not open");
    return value;
  };
  return { hook, options, edit, open, saved, request, editor };
}
it("opens the whole chapter and saves dirty content before the atomic metadata request", async () => {
  const f = setup();
  expect(f.hook.result.current.pageEditor?.chapter.pages).toHaveLength(3);
  await act(async () => f.editor().onSave(f.request));
  expect(f.options.saveNow.mock.invocationCallOrder[0]).toBeLessThan(
    f.edit.mock.invocationCallOrder[0],
  );
  expect(f.options.currentChapterRef.current).toBe(f.saved);
  expect(f.options.resetSaveBaseline).toHaveBeenCalledWith(f.saved);
  expect(f.options.clearDirtyTracking).toHaveBeenCalledOnce();
  expect(f.options.setSelectedPageId).not.toHaveBeenCalled();
  await act(async () => {
    expect(await f.editor().onReload()).toBe(f.saved);
  });
  act(() => f.editor().onClose());
  expect(f.hook.result.current.pageEditor).toBeNull();
});
it("does not submit metadata if the current page save fails or the chapter changes", async () => {
  const f = setup();
  f.options.saveNow.mockRejectedValueOnce(new Error("save failed"));
  await expect(f.editor().onSave(f.request)).rejects.toThrow("save failed");
  expect(f.edit).not.toHaveBeenCalled();
  f.options.currentChapterRef.current = { ...f.saved, id: "another" };
  await expect(f.editor().onSave(f.request)).rejects.toThrow("변경");
  expect(f.edit).not.toHaveBeenCalled();
  expect(f.hook.result.current.pageEditor).not.toBeNull();
});
