/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../src/renderer/src/components/ui/Button";
import { SortableFinalChapterCard } from "../src/renderer/src/components/shareImport/ShareImportMergeCards";
import {
  Input,
  Textarea,
  TextField,
} from "../src/renderer/src/components/ui/Field";

afterEach(cleanup);

describe("native control primitives", () => {
  it("names the shared chapter title field and preserves its edit callback", () => {
    const onTitleChange = vi.fn();
    render(
      <SortableFinalChapterCard
        busy={false}
        index={0}
        item={{
          key: "existing:chapter-1",
          source: "existing",
          chapterId: "chapter-1",
          title: "1화",
          pageCount: 2,
        }}
        onDelete={vi.fn()}
        onTitleChange={onTitleChange}
      />,
    );
    const title = screen.getByRole("textbox", { name: "화 제목" });
    expect(title).toHaveProperty("value", "1화");
    fireEvent.change(title, { target: { value: "수정한 제목" } });
    expect(onTitleChange).toHaveBeenCalledWith("수정한 제목");
  });

  it("keeps bare children, refs, listener precedence and event targets native", () => {
    const ref = React.createRef<HTMLButtonElement>();
    const first = vi.fn();
    const targets: EventTarget[] = [];
    const attributes = { "aria-label": "drag handle", onPointerDown: first };
    const listeners = {
      onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
        targets.push(event.currentTarget);
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        targets.push(event.currentTarget);
      },
    };
    render(
      <Button
        ref={ref}
        className="handle"
        {...attributes}
        {...listeners}
        variant="bare"
      >
        <svg aria-hidden="true" />
        <strong>Move</strong>
      </Button>,
    );
    const button = screen.getByRole("button", { name: "drag handle" });
    expect(ref.current).toBe(button);
    expect(button.classList.contains("handle")).toBe(true);
    expect(
      [...button.children].map((child) => child.tagName.toLowerCase()),
    ).toEqual(["svg", "strong"]);
    fireEvent.pointerDown(button);
    fireEvent.keyDown(button, { key: "ArrowDown" });
    expect(first).not.toHaveBeenCalled();
    expect(targets).toEqual([button, button]);
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it("renders bare icon props in order without adding wrapper elements", () => {
    render(
      <Button variant="bare" iconLeft={<svg />} iconRight={<i />}>
        <strong>Bare label</strong>
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Bare label" });
    expect(
      [...button.children].map((child) => child.tagName.toLowerCase()),
    ).toEqual(["svg", "strong", "i"]);
  });

  it("preserves native omitted and explicit submit types while styled buttons remain actions", () => {
    const submitted = vi.fn();
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted();
        }}
      >
        <Button variant="bare">Native default</Button>
        <Button variant="bare" type="submit">
          Submit
        </Button>
        <Button variant="bare" type="button">
          Action
        </Button>
        <Button>Styled action</Button>
      </form>,
    );
    const native = screen.getByRole("button", { name: "Native default" });
    expect(native.hasAttribute("type")).toBe(false);
    expect((native as HTMLButtonElement).type).toBe("submit");
    fireEvent.click(native);
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    fireEvent.click(screen.getByRole("button", { name: "Action" }));
    fireEvent.click(screen.getByRole("button", { name: "Styled action" }));
    expect(submitted).toHaveBeenCalledTimes(2);
  });

  it("retains native disabled click and focus behavior", () => {
    const onClick = vi.fn();
    render(
      <>
        <Input aria-label="Focus target" />
        <Button variant="bare" disabled onClick={onClick}>
          Disabled
        </Button>
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Focus target" });
    const button = screen.getByRole("button", { name: "Disabled" });
    input.focus();
    button.click();
    button.focus();
    expect(onClick).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps styled icon and label wrappers unchanged", () => {
    render(
      <Button size="sm" iconLeft={<svg />} iconRight={<i />}>
        Styled label
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Styled label" });
    expect([...button.children].map((child) => child.tagName)).toEqual([
      "SPAN",
      "SPAN",
      "SPAN",
    ]);
    expect(button.children[0].firstElementChild?.tagName.toLowerCase()).toBe(
      "svg",
    );
    expect(button.children[1].textContent).toBe("Styled label");
    expect(button.children[2].firstElementChild?.tagName).toBe("I");
    expect(button.getAttribute("type")).toBe("button");
  });

  it("keeps uncontrolled input values, selection, validity and composition events native", () => {
    const ref = React.createRef<HTMLInputElement>();
    const composed: string[] = [];
    const changes: EventTarget[] = [];
    const view = render(
      <Input
        ref={ref}
        aria-label="Code"
        defaultValue=""
        required
        pattern="[A-Z]+"
        onChange={(event) => changes.push(event.currentTarget)}
        onCompositionStart={(event) => composed.push(`start:${event.data}`)}
        onCompositionUpdate={(event) => composed.push(`update:${event.data}`)}
        onCompositionEnd={(event) => composed.push(`end:${event.data}`)}
      />,
    );
    const input = screen.getByRole("textbox", {
      name: "Code",
    }) as HTMLInputElement;
    expect(view.container.firstElementChild).toBe(input);
    expect(ref.current).toBe(input);
    expect(input.checkValidity()).toBe(false);
    fireEvent.compositionStart(input, { data: "ㅎ" });
    fireEvent.compositionUpdate(input, { data: "한" });
    fireEvent.compositionEnd(input, { data: "한" });
    expect(composed).toEqual(["start:ㅎ", "update:한", "end:한"]);
    fireEvent.change(input, { target: { value: "ABC" } });
    expect(input.value).toBe("ABC");
    expect(input.checkValidity()).toBe(true);
    expect(changes).toEqual([input]);
    input.focus();
    input.setSelectionRange(1, 3);
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3]);
  });

  it("forwards native numeric constraints and invalid callbacks without coercion", () => {
    const invalid = vi.fn();
    render(
      <Input
        type="number"
        aria-label="Count"
        min={1}
        max={5}
        step={2}
        defaultValue={3}
        onInvalid={invalid}
      />,
    );
    const input = screen.getByRole("spinbutton", {
      name: "Count",
    }) as HTMLInputElement;
    expect(input.checkValidity()).toBe(true);
    fireEvent.change(input, { target: { value: "4" } });
    expect(input.value).toBe("4");
    expect(input.checkValidity()).toBe(false);
    expect(invalid).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
  });

  it("keeps TextField label structure and native textarea refs and selection", () => {
    const ref = React.createRef<HTMLTextAreaElement>();
    render(
      <>
        <TextField
          label="Name"
          hint="Help"
          defaultValue="Alice"
          className="field-owner"
        />
        <Textarea
          ref={ref}
          aria-label="Notes"
          defaultValue="two lines\nremain"
          rows={3}
          maxLength={100}
        />
      </>,
    );
    const input = screen.getByRole("textbox", { name: "Name Help" });
    const label = input.parentElement;
    if (!label) throw new Error("Missing field label");
    expect(label.tagName).toBe("LABEL");
    expect(label.classList.contains("field-owner")).toBe(true);
    expect([...label.children].map((child) => child.tagName)).toEqual([
      "SPAN",
      "INPUT",
      "SPAN",
    ]);
    const notes = screen.getByRole("textbox", {
      name: "Notes",
    }) as HTMLTextAreaElement;
    expect(ref.current).toBe(notes);
    expect(notes.rows).toBe(3);
    expect(notes.maxLength).toBe(100);
    notes.focus();
    notes.select();
    expect(notes.selectionEnd).toBe(notes.value.length);
  });
});
