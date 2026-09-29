/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConditionalPatternBuilder } from "../src/renderer/src/components/ConditionalPatternBuilder";
import {
  createConditionalLiteralMatcher,
  createConditionalLiteralReplacement,
  findConditionalTextMatches,
  type ConditionalTextMatcherV3,
} from "../src/shared/conditionalTextPattern";

afterEach(cleanup);

it("reorders literal and character nodes through their drag handles and clears cancelled drags", () => {
  const initial = createConditionalLiteralMatcher("a");
  if (initial.mode !== "visual") throw new Error("Expected visual matcher");
  const literalId = initial.nodes[0].id;
  initial.nodes.push({
    id: "number-node",
    kind: "character",
    character: "number",
    repeat: { min: 1, max: 1, greedy: true },
  });
  const onChange = vi.fn();
  function Fixture() {
    const [matcher, setMatcher] =
      React.useState<ConditionalTextMatcherV3>(initial);
    return (
      <ConditionalPatternBuilder
        matcher={matcher}
        onChangeMatcher={(next) => {
          onChange(next);
          setMatcher(next);
        }}
      />
    );
  }
  render(<Fixture />);
  const literalInput = screen.getByRole("textbox", { name: "글자 그대로" });
  const handles = screen.getAllByRole("button", { name: "패턴 조각 끌기" });
  expect(handles).toHaveLength(2);
  for (const handle of handles) {
    expect(handle.getAttribute("type")).toBe("button");
    expect(handle).toHaveProperty("draggable", true);
    expect(handle.parentElement?.tagName).toBe("SPAN");
    expect([...handle.children].map((child) => child.tagName)).toEqual(["svg"]);
  }
  fireEvent.dragStart(handles[0]);
  expect(handles[0].parentElement?.getAttribute("data-dragged")).toBe("true");
  expect(fireEvent.dragOver(handles[1])).toBe(false);
  fireEvent.drop(handles[1]);
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0].nodes).toEqual([
    initial.nodes[1],
    initial.nodes[0],
  ]);
  expect(screen.getByRole("textbox", { name: "글자 그대로" })).toBe(
    literalInput,
  );
  expect(literalInput).toHaveProperty("value", "a");

  const [numberHandle, literalHandle] = screen.getAllByRole("button", {
    name: "패턴 조각 끌기",
  });
  fireEvent.dragStart(numberHandle);
  expect(numberHandle.parentElement?.getAttribute("data-dragged")).toBe("true");
  fireEvent.dragEnd(numberHandle);
  expect(numberHandle.parentElement?.getAttribute("data-dragged")).toBe(
    "false",
  );
  fireEvent.drop(literalHandle);
  expect(onChange).toHaveBeenCalledTimes(1);
  fireEvent.dragStart(numberHandle);
  fireEvent.drop(literalHandle);
  expect(onChange).toHaveBeenCalledTimes(2);
  expect(
    onChange.mock.calls[1][0].nodes.map((node: { id: string }) => node.id),
  ).toEqual([literalId, "number-node"]);
});

it.each(["정확히 N개", "N~M개"])(
  "keeps %s editable even when counts overlap a preset",
  (label) => {
    function Fixture() {
      const [matcher, setMatcher] = React.useState(
        createConditionalLiteralMatcher("a"),
      );
      return (
        <ConditionalPatternBuilder
          matcher={matcher}
          onChangeMatcher={setMatcher}
        />
      );
    }
    render(<Fixture />);
    fireEvent.click(screen.getByLabelText("패턴 조각 추가"));
    fireEvent.click(screen.getByRole("button", { name: "반복·기억 설정" }));
    fireEvent.click(screen.getByRole("combobox", { name: "반복 횟수" }));
    fireEvent.click(screen.getByRole("option", { name: label }));
    expect(
      screen.getByRole("combobox", { name: "반복 횟수" }).textContent,
    ).toContain(label);
    fireEvent.change(screen.getByLabelText("최소 반복"), {
      target: { value: "0" },
    });
    expect(screen.getByLabelText("최소 반복")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("최소 반복"), {
      target: { value: "1" },
    });
    expect(screen.getByLabelText("최소 반복")).toBeTruthy();
    if (label === "N~M개") {
      expect(screen.getByLabelText("최대 반복")).toBeTruthy();
    }
  },
);

it.each(["$&", "$$", "$1", "$<name>", "$` $'"])(
  "preserves literal replacement %s when switching to raw code",
  (text) => {
    const matcher = createConditionalLiteralMatcher("abc");
    const replacement = createConditionalLiteralReplacement(text);
    const onSwitchToRaw = vi.fn();
    render(
      <ConditionalPatternBuilder
        matcher={matcher}
        replacement={replacement}
        onChangeMatcher={() => {}}
        onChangeReplacement={() => {}}
        onSwitchToRaw={onSwitchToRaw}
      />,
    );
    fireEvent.click(screen.getByText("정규식 코드 보기"));
    fireEvent.click(screen.getByRole("button", { name: "직접 수정" }));
    const [rawMatcher, rawReplacement] = onSwitchToRaw.mock.calls[0];
    expect(
      findConditionalTextMatches("abc", rawMatcher, rawReplacement, true)[0]
        .replacement,
    ).toBe(text);
  },
);

it("preserves a captured part beside literal dollar references", () => {
  const matcher = createConditionalLiteralMatcher("abc");
  if (matcher.mode !== "visual") throw new Error("Expected visual matcher");
  matcher.nodes[0] = {
    ...matcher.nodes[0],
    captureId: "word",
  } as (typeof matcher.nodes)[number];
  const replacement = createConditionalLiteralReplacement("$1/");
  if (replacement.mode !== "visual")
    throw new Error("Expected visual replacement");
  replacement.parts.push({ id: "capture", kind: "capture", captureId: "word" });
  const onSwitchToRaw = vi.fn();
  render(
    <ConditionalPatternBuilder
      matcher={matcher}
      replacement={replacement}
      onChangeMatcher={() => {}}
      onChangeReplacement={() => {}}
      onSwitchToRaw={onSwitchToRaw}
    />,
  );
  fireEvent.click(screen.getByText("정규식 코드 보기"));
  fireEvent.click(screen.getByRole("button", { name: "직접 수정" }));
  const [rawMatcher, rawReplacement] = onSwitchToRaw.mock.calls[0];
  expect(
    findConditionalTextMatches("abc", rawMatcher, rawReplacement, true)[0]
      .replacement,
  ).toBe("$1/abc");
});
