/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranslateSourceModal } from "../src/renderer/src/components/TranslateSourceModal";
import buttonStyles from "../src/renderer/src/components/ui/Button.module.css";

afterEach(cleanup);

describe("TranslateSourceModal", () => {
  it("keeps source choices neutral and omits the redundant ordering note", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <TranslateSourceModal
        busy={false}
        onCancel={vi.fn()}
        onSelect={onSelect}
      />,
    );

    const sourceChoices = [...container.querySelectorAll(".source-choice")];
    expect(sourceChoices).toHaveLength(5);
    for (const choice of sourceChoices) {
      expect(choice.tagName).toBe("BUTTON");
      expect(choice.getAttribute("type")).toBe("button");
      expect([...choice.classList].sort()).toEqual(
        [buttonStyles.bare, "source-choice"].sort(),
      );
      expect(choice.classList.contains(buttonStyles.primary)).toBe(false);
      expect([...choice.children].map((child) => child.className)).toEqual([
        "source-choice-icon",
        "source-choice-copy",
      ]);
      expect(choice.children[0].getAttribute("aria-hidden")).toBe("true");
      expect(choice.children[0].firstElementChild?.tagName).toBe("svg");
      expect(choice.children[1].firstElementChild?.tagName).toBe("STRONG");
    }
    expect(container.querySelector(".source-choice-order-note")).toBeNull();
    expect(screen.queryByText(/파일명의 숫자를 인식/)).toBeNull();
    for (const name of [
      "이미지 열기",
      "폴더 열기",
      "압축파일 열기",
      "PDF 열기",
      "링크로 열기",
    ]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(onSelect.mock.calls).toEqual([
      ["images"],
      ["folder"],
      ["zip"],
      ["pdf"],
      ["web"],
    ]);
  });

  it("keeps all source and cancel actions disabled while busy", () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <TranslateSourceModal busy onCancel={onCancel} onSelect={onSelect} />,
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveProperty("disabled", true);
      fireEvent.click(button);
    }
    expect(onSelect).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    rerender(
      <TranslateSourceModal
        busy={false}
        onCancel={onCancel}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
