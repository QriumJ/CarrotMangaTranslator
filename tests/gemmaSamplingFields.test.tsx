/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { appI18n, initializeAppI18n } from "../src/renderer/src/appI18n";
import { GemmaSamplingFields } from "../src/renderer/src/components/settingsModal/GemmaSamplingFields";
import { DEFAULT_GEMMA_SAMPLING } from "../src/shared/gemmaSamplingSettings";

afterEach(cleanup);

describe("Gemma sampling controls", () => {
  it("starts collapsed, edits bounded values, restores defaults and disables edits while busy", async () => {
    await initializeAppI18n("ko");
    const clear = vi.fn();
    function Harness({ busy }: { busy: boolean }) {
      const [sampling, setSampling] = React.useState({
        temperature: 0.4,
        topP: 0.8,
        topK: 40,
      });
      return (
        <I18nextProvider i18n={appI18n}>
          <GemmaSamplingFields
            gemmaSampling={sampling}
            setGemmaSampling={setSampling}
            clearTestState={clear}
            controlsBusy={busy}
          />
        </I18nextProvider>
      );
    }
    const view = render(<Harness busy={false} />);
    expect(screen.queryByRole("textbox", { name: "Temperature" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "번역 생성 설정" }));
    const input = (name: string) =>
      screen.getByRole("textbox", { name }) as HTMLInputElement;
    fireEvent.change(input("Temperature"), { target: { value: "0" } });
    fireEvent.blur(input("Temperature"));
    expect(input("Temperature").value).toBe("0");
    fireEvent.change(input("Top K"), { target: { value: "999" } });
    fireEvent.blur(input("Top K"));
    expect(input("Top K").value).toBe("40");
    fireEvent.change(input("Top K"), { target: { value: "500" } });
    fireEvent.blur(input("Top K"));
    expect(input("Top K").value).toBe("500");
    fireEvent.change(input("Top P"), { target: { value: "0" } });
    fireEvent.blur(input("Top P"));
    expect(input("Top P").value).toBe("0.8");
    fireEvent.change(input("Top P"), { target: { value: "0.01" } });
    fireEvent.blur(input("Top P"));
    expect(input("Top P").value).toBe("0.01");
    fireEvent.click(screen.getByRole("button", { name: "기본값 복원" }));
    expect(Number(input("Temperature").value)).toBe(
      DEFAULT_GEMMA_SAMPLING.temperature,
    );
    expect(Number(input("Top P").value)).toBe(DEFAULT_GEMMA_SAMPLING.topP);
    expect(Number(input("Top K").value)).toBe(DEFAULT_GEMMA_SAMPLING.topK);
    expect(clear).toHaveBeenCalled();
    view.rerender(<Harness busy />);
    expect(input("Temperature").disabled).toBe(true);
    expect(input("Top P").disabled).toBe(true);
    expect(input("Top K").disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "기본값 복원" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.queryByText("Reasoning effort")).toBeNull();
  });
});
