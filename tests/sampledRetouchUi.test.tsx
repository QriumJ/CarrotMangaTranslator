// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import { useSampledGestureLifecycle } from "../src/renderer/src/hooks/useSampledGestureLifecycle";
import { useSampledRetouch } from "../src/renderer/src/inpainting/sampledRetouchModel";
import { queueSampledCursor } from "../src/renderer/src/lib/sampledRetouchCursor";
import type { InpaintingTool } from "../src/renderer/src/inpainting/inpaintingTypes";
import { StageToolbar } from "../src/renderer/src/components/StageToolbar";
import { RetouchLiveLayer } from "../src/renderer/src/components/imageStageLayers";
import { SampledRetouchProvider } from "../src/renderer/src/inpainting/SampledRetouchProvider";
import {
  SampledRetouchSliders,
  SampledRetouchSourceControls,
} from "../src/renderer/src/components/inpaintingPanel/SampledRetouchSettings";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("updates the source picker on Alt press/release and window blur, and detaches it when leaving the tool", () => {
  vi.useFakeTimers();
  vi.stubGlobal("mangaApi", {
    cancelInpaintingRetouch: vi.fn(async () => undefined),
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(16), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) =>
    window.clearTimeout(id),
  );
  const stageRef = { current: document.createElement("div") };
  const hook = renderHook(
    ({ tool }: { tool: InpaintingTool }) => {
      useSampledGestureLifecycle("page-1", "original.png", tool, stageRef);
      return useSampledRetouch();
    },
    {
      initialProps: { tool: "clone" as InpaintingTool },
      wrapper: SampledRetouchProvider,
    },
  );
  const flush = () =>
    act(() => {
      vi.advanceTimersByTime(16);
    });
  queueSampledCursor(stageRef.current, {
    sourcePoint: { x: 20, y: 20 },
    destination: { x: 50, y: 50 },
    geometry: {
      imageWidth: 100,
      imageHeight: 100,
      displayWidth: 100,
      displayHeight: 100,
    },
    radius: 10,
    opacity: 1,
    hardness: 1,
    image: null,
    drawing: false,
    picking: false,
  });
  flush();
  expect(stageRef.current.dataset.sampledState).toBe("ready");
  fireEvent.keyDown(window, { key: "Alt" });
  fireEvent.keyDown(window, { key: "Alt", repeat: true });
  flush();
  expect(hook.result.current?.altHeld.current).toBe(true);
  expect(stageRef.current.dataset.sampledState).toBe("pick");
  fireEvent.keyUp(window, { key: "Alt" });
  flush();
  expect(hook.result.current?.altHeld.current).toBe(false);
  expect(stageRef.current.dataset.sampledState).toBe("ready");
  act(() => hook.result.current?.setSampling(true));
  fireEvent.keyDown(window, { key: "Alt" });
  fireEvent.blur(window);
  flush();
  expect(hook.result.current?.altHeld.current).toBe(false);
  expect(stageRef.current.dataset.sampledState).toBe("pick");
  act(() => hook.result.current?.setSampling(false));
  flush();
  expect(stageRef.current.dataset.sampledState).toBe("ready");
  hook.rerender({ tool: "brush" });
  fireEvent.keyDown(window, { key: "Alt" });
  flush();
  expect(hook.result.current?.altHeld.current).toBe(false);
  expect(stageRef.current.dataset.sampledState).toBeUndefined();
});
it("selects both sampled tools from the existing toolbar menu", () => {
  const select = vi.fn();
  render(
    <StageToolbar
      brushColor="#ffffff"
      disabled={false}
      hidden={false}
      lastRetouchTool="clone"
      onSelectTool={select}
      onToggleHidden={() => {}}
      onToggleRegionTranslation={() => {}}
      regionTranslationActive={false}
      regionTranslationAvailable
      tool="clone"
    />,
  );
  fireEvent.pointerEnter(screen.getByRole("button", { name: "칠하기 도구" }));
  const clone = screen.getByRole("menuitemradio", { name: "복제 도장" });
  expect(clone.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(screen.getByRole("menuitemradio", { name: "치유 브러시" }));
  expect(select).toHaveBeenCalledWith("heal");
});
it.each(["clone", "heal"] as const)(
  "mounts original source and source marker for %s",
  (mode) => {
    const { container, rerender } = render(
      <RetouchLiveLayer
        retouchCursor={{ mode, radiusPx: 28, color: "#ffffff" }}
        retouchOriginalImageDataUrl="data:image/png;base64,AA=="
        stageSize={{ width: 400, height: 400 }}
      />,
    );
    expect(
      container.querySelector("[data-retouch-original-source]"),
    ).toBeTruthy();
    expect(container.querySelector("[data-sampled-source]")).toBeTruthy();
    rerender(
      <RetouchLiveLayer
        retouchCursor={{ mode, radiusPx: 28, color: "#ffffff" }}
        retouchOriginalImageDataUrl=""
        stageSize={null}
      />,
    );
    expect(
      container.querySelector("[data-retouch-original-source]"),
    ).toBeNull();
  },
);
it("exposes accessible source selection and the healing defaults", () => {
  render(
    <SampledRetouchProvider>
      <SampledRetouchSliders tool="heal" />
      <SampledRetouchSourceControls />
    </SampledRetouchProvider>,
  );
  expect(screen.getByText("50%")).toBeTruthy();
  expect(screen.getByText("원본 위치 미지정")).toBeTruthy();
  const pick = screen.getByRole("button", { name: "원본 지정" });
  fireEvent.click(pick);
  expect(pick.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("이미지에서 원본을 클릭하세요")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "페이지 원본" }));
  expect(
    screen
      .getByRole("radio", { name: "페이지 원본" })
      .getAttribute("aria-checked"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("checkbox"));
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
    false,
  );
});
it("renders the on-canvas pick hint for both hint kinds", () => {
  const { container } = render(
    <RetouchLiveLayer
      retouchCursor={{ mode: "clone", radiusPx: 28, color: "#ffffff" }}
      retouchOriginalImageDataUrl=""
      stageSize={{ width: 400, height: 400 }}
    />,
  );
  const hint = container.querySelector<HTMLElement>("[data-sampled-hint]");
  expect(hint?.hidden).toBe(true);
  expect(hint?.textContent).toContain("클릭해서 복사할 원본 지정");
  expect(container.querySelector("[data-sampled-source-ring]")).toBeTruthy();
});
