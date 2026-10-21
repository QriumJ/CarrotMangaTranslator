/** @vitest-environment jsdom */
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useUpdateBlockAction } from "../src/renderer/src/hooks/useUpdateSelectedBlockAction";
import type { UpdateCurrentChapter } from "../src/renderer/src/hooks/useCurrentChapterUpdater";
import { makePage } from "./helpers/workspacePointerFixtures";

describe("partial formatting history grouping", () => {
  it("groups repeated leading edits separately from typing and OCR changes", () => {
    const update = vi.fn<UpdateCurrentChapter>();
    const page = makePage({ blockPatch: { translatedText: "가나" } });
    const { result } = renderHook(() =>
      useUpdateBlockAction({
        selectedPage: page,
        selectedPageEditLocked: false,
        updateCurrentChapter: update,
      }),
    );
    result.current("block-1", {
      translatedText: "가[line-height=2]나[/line-height]",
    });
    result.current("block-1", {
      translatedText: "가[line-height=1.8]나[/line-height]",
    });
    result.current("block-1", { translatedText: "가나다" });
    result.current("block-1", { sourceText: "new OCR" });
    expect(update.mock.calls.map((call) => call[2]?.mergeKey)).toEqual([
      "style:block-1",
      "style:block-1",
      "text:block-1",
      "text:block-1",
    ]);
  });
});
