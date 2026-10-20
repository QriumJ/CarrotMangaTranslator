/** @vitest-environment jsdom */
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ActionMenu } from "../src/renderer/src/components/ui/ActionMenu";
import { StageToolbar } from "../src/renderer/src/components/StageToolbar";
import { ChapterQuickControls } from "../src/renderer/src/components/ChapterQuickControls";

afterEach(cleanup);

it("keeps an action menu outside clipping containers and restores trigger focus", async () => {
  const run = vi.fn();
  const { container } = render(
    <div style={{ overflow: "hidden", height: 32 }}>
      <ActionMenu
        label="작품 메뉴"
        items={[
          { label: "용어", run },
          { label: "삭제", run, destructive: true },
        ]}
      />
    </div>,
  );
  const trigger = screen.getByRole("button", { name: "작품 메뉴" });
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const menu = screen.getByRole("menu");
  expect(container.contains(menu)).toBe(false);
  const first = within(menu).getByRole("menuitem", { name: "용어" });
  await waitFor(() => expect(document.activeElement).toBe(first));
  fireEvent.pointerDown(first);
  expect(screen.getByRole("menu")).toBe(menu);
  fireEvent.click(first);
  expect(run).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("menu")).toBeNull();
});

it("navigates the real editor toolbar without activating tools and skips disabled buttons", () => {
  const select = vi.fn();
  render(
    <StageToolbar
      brushColor="#000000"
      disabled={false}
      hidden={false}
      lastRetouchTool="brush"
      onSelectTool={select}
      onToggleRegionTranslation={vi.fn()}
      onToggleHidden={vi.fn()}
      regionTranslationActive={false}
      regionTranslationAvailable
      tool="select"
    />,
  );
  const toolbar = screen.getByRole("toolbar");
  const buttons = within(toolbar)
    .getAllByRole("button")
    .filter((button) => !(button as HTMLButtonElement).disabled);
  expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
  buttons[0].focus();
  fireEvent.keyDown(buttons[0], { key: "ArrowDown" });
  expect(document.activeElement).toBe(buttons[1]);
  fireEvent.keyDown(buttons[1], { key: "End" });
  expect(document.activeElement).toBe(buttons.at(-1));
  const last = buttons.at(-1);
  if (!last) throw Error("Missing toolbar end");
  fireEvent.keyDown(last, { key: "Home" });
  expect(document.activeElement).toBe(buttons[0]);
  expect(select).not.toHaveBeenCalled();
});

it("gives quick controls one tab stop and skips unavailable undo", () => {
  const act = vi.fn();
  render(
    <ChapterQuickControls
      canRedo
      canUndo={false}
      chapterAvailable
      compareAvailable
      disabled={false}
      peeking={false}
      resetAvailable
      showBlockChrome
      showTextBlocks
      onPeekToggle={act}
      onOpenStyleGuide={act}
      onOpenTextView={act}
      onRedo={act}
      onResetPage={act}
      onToggleBlocks={act}
      onToggleChrome={act}
      onUndo={act}
    />,
  );
  const toolbar = screen.getByRole("toolbar");
  const buttons = within(toolbar)
    .getAllByRole("button")
    .filter((button) => !(button as HTMLButtonElement).disabled);
  expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
  buttons[0].focus();
  fireEvent.keyDown(buttons[0], { key: "End" });
  expect(document.activeElement).toBe(buttons.at(-1));
  expect(act).not.toHaveBeenCalled();
});
