/** @vitest-environment jsdom */
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { I18nextProvider } from "react-i18next";
import { appI18n, initializeAppI18n } from "../src/renderer/src/appI18n";
import { TranslationLanguageFields } from "../src/renderer/src/components/settingsModal/TranslationLanguageFields";
import {
  chooseCustomSelectOption,
  openCustomSelect,
} from "./testUtils/customSelect";

beforeEach(async () => {
  await initializeAppI18n("ko");
});
afterEach(cleanup);
function Harness({ initial = "auto" }: { initial?: string }) {
  const [sourceLanguage, setSourceLanguage] = React.useState(initial);
  const [targetLanguage, setTargetLanguage] = React.useState("ko");
  return (
    <I18nextProvider i18n={appI18n}>
      <TranslationLanguageFields
        controlsBusy={false}
        {...{
          sourceLanguage,
          targetLanguage,
          setSourceLanguage,
          setTargetLanguage,
        }}
      />
    </I18nextProvider>
  );
}
it("offers auto only for the source and prevents swapping it into the target", () => {
  render(<Harness />);
  expect(
    screen.getByRole("combobox", { name: "원문 언어" }).textContent,
  ).toContain("자동");
  expect(
    (screen.getByRole("button", { name: /언어 바꾸기/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  const targets = openCustomSelect("번역 언어");
  expect(within(targets).queryByRole("option", { name: "자동" })).toBeNull();
  fireEvent.keyDown(targets, { key: "Escape" });
  chooseCustomSelectOption("원문 언어", "일본어");
  const swap = screen.getByRole("button", { name: /언어 바꾸기/ });
  expect((swap as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(swap);
  expect(
    screen.getByRole("combobox", { name: "원문 언어" }).textContent,
  ).toContain("한국어");
  expect(
    screen.getByRole("combobox", { name: "번역 언어" }).textContent,
  ).toContain("일본어");
  chooseCustomSelectOption("원문 언어", "자동");
  expect((swap as HTMLButtonElement).disabled).toBe(true);
});
it("preserves explicit source choices and custom language editing", () => {
  render(<Harness initial="en" />);
  expect(
    screen.getByRole("combobox", { name: "원문 언어" }).textContent,
  ).toContain("영어");
  chooseCustomSelectOption("원문 언어", "직접 입력…");
  fireEvent.change(screen.getByRole("textbox", { name: /원문 언어 코드/ }), {
    target: { value: "eo" },
  });
  expect(
    (
      screen.getByRole("textbox", {
        name: /원문 언어 코드/,
      }) as HTMLInputElement
    ).value,
  ).toBe("eo");
  chooseCustomSelectOption("원문 언어", "자동");
  expect(screen.queryByRole("textbox", { name: /원문 언어 코드/ })).toBeNull();
});
