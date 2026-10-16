// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useSampledRetouchState } from "../src/renderer/src/inpainting/sampledRetouchModel";
import {
  beginSampledGesture,
  finishSampledGesture,
} from "../src/renderer/src/hooks/sampledRetouchGesture";
import type { UseWorkspaceInpaintingPointerHandlersOptions } from "../src/renderer/src/hooks/workspaceInpaintingPointerTypes";
import { makePage } from "./helpers/workspacePointerFixtures";
import { createPageRevision } from "../src/shared/pageRevision";

afterEach(cleanup);
function fixture() {
  const hook = renderHook(useSampledRetouchState);
  const image = document.createElement("img");
  image.src = "https://example.invalid/before.png";
  const options: Pick<
    UseWorkspaceInpaintingPointerHandlersOptions,
    | "selectedPage"
    | "inpaintingTool"
    | "inpaintingBrushRadius"
    | "imageRef"
    | "stageRef"
    | "pushStatus"
    | "applyRetouchOperation"
  > = {
    selectedPage: makePage(),
    inpaintingTool: "clone",
    inpaintingBrushRadius: 20,
    imageRef: { current: image },
    stageRef: { current: document.createElement("div") },
    pushStatus: vi.fn(),
    applyRetouchOperation: vi.fn(
      async (
        operation: import("../src/renderer/src/hooks/inpaintingRetouchTypes").RetouchApplyOperation,
      ) => {
        operation.onSettled?.("after.png");
      },
    ),
  };
  const point = (x: number, y: number) => ({
    point: { x, y },
    geometry: {
      imageWidth: 1000,
      imageHeight: 1000,
      displayWidth: 500,
      displayHeight: 500,
    },
  });
  return { hook, image, options, point };
}
it("requires a source, freezes integer displacement and revision, and respects aligned mode", () => {
  const { hook, options, point } = fixture();
  act(() => {
    expect(
      beginSampledGesture(hook.result.current, options, point(50, 60), false),
    ).toBe(false);
  });
  // The first plain click defines the source instead of being ignored.
  expect(hook.result.current.hasAnchor).toBe(true);
  expect(hook.result.current.anchor.current).toEqual({ x: 50, y: 60 });
  expect(hook.result.current.stroke.current).toBeNull();
  act(() => {
    beginSampledGesture(hook.result.current, options, point(10.3, 20.4), true);
  });
  expect(hook.result.current.anchor.current).toEqual({ x: 10, y: 20 });
  expect(
    beginSampledGesture(hook.result.current, options, point(50.2, 60.2), false),
  ).toBe(true);
  expect(hook.result.current.stroke.current).toMatchObject({
    expectedRevision: createPageRevision(makePage()),
    sampled: { offset: { x: -40, y: -40 } },
  });
  beginSampledGesture(hook.result.current, options, point(70, 80), false);
  expect(hook.result.current.stroke.current?.sampled?.offset).toEqual({
    x: -40,
    y: -40,
  });
  act(() => {
    hook.result.current.setAligned(false);
  });
  beginSampledGesture(hook.result.current, options, point(70, 80), false);
  expect(hook.result.current.stroke.current?.sampled?.offset).toEqual({
    x: -60,
    y: -60,
  });
  beginSampledGesture(hook.result.current, options, point(70.5, 80.5), false);
  expect(hook.result.current.stroke.current?.sampled?.offset).toEqual({
    x: -61,
    y: -61,
  });
});
it("keeps the tool busy until the committed image loads, then releases the listener", async () => {
  const { hook, image, options, point } = fixture();
  act(() => {
    beginSampledGesture(hook.result.current, options, point(10, 20), true);
  });
  beginSampledGesture(hook.result.current, options, point(50, 60), false);
  await act(async () => {
    await finishSampledGesture(hook.result.current, options, [
      { x: 50, y: 60 },
    ]);
  });
  expect(hook.result.current.busy).toBe(true);
  expect(
    beginSampledGesture(hook.result.current, options, point(70, 80), false),
  ).toBe(false);
  act(() => {
    image.src = "https://example.invalid/after.png";
    image.dispatchEvent(new Event("load"));
  });
  expect(hook.result.current.busy).toBe(false);
  expect(hook.result.current.previewCleanup.current).toBeNull();
});
it("releases a failed request without leaving the tool busy", async () => {
  const { hook, options, point } = fixture();
  act(() => {
    beginSampledGesture(hook.result.current, options, point(10, 20), true);
  });
  beginSampledGesture(hook.result.current, options, point(50, 60), false);
  options.applyRetouchOperation = vi
    .fn()
    .mockRejectedValue(new Error("save failed"));
  await act(async () => {
    await finishSampledGesture(hook.result.current, options, [
      { x: 50, y: 60 },
    ]);
  });
  expect(hook.result.current.busy).toBe(false);
  expect(hook.result.current.pending.current).toBeNull();
  expect(options.pushStatus).toHaveBeenCalledWith("save failed");
});
it("switches the canvas cursor between picking, previewing and painting", async () => {
  const {
    resolveSampledCursorState,
    queueSampledCursor,
    refreshSampledCursor,
  } = await import("../src/renderer/src/lib/sampledRetouchCursor");
  const source = { x: 10, y: 10 };
  expect(
    resolveSampledCursorState({
      sourcePoint: null,
      picking: false,
      drawing: false,
    }),
  ).toBe("pick");
  expect(
    resolveSampledCursorState({
      sourcePoint: source,
      picking: true,
      drawing: false,
    }),
  ).toBe("pick");
  expect(
    resolveSampledCursorState({
      sourcePoint: source,
      picking: false,
      drawing: false,
    }),
  ).toBe("ready");
  expect(
    resolveSampledCursorState({
      sourcePoint: source,
      picking: false,
      drawing: true,
    }),
  ).toBe("paint");

  vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
  try {
    const stage = document.createElement("div");
    stage.innerHTML =
      '<svg><g data-sampled-source=""><circle data-sampled-source-ring="" r="5"></circle></g></svg><div data-sampled-hint="" hidden></div>';
    queueSampledCursor(stage, {
      sourcePoint: null,
      destination: { x: 100, y: 100 },
      geometry: {
        imageWidth: 1000,
        imageHeight: 1000,
        displayWidth: 500,
        displayHeight: 500,
      },
      radius: 20,
      opacity: 1,
      hardness: 1,
      image: null,
      drawing: false,
      picking: false,
    });
    vi.advanceTimersToNextFrame();
    const hint = stage.querySelector<HTMLElement>("[data-sampled-hint]");
    expect(stage.dataset.sampledState).toBe("pick");
    expect(hint?.hidden).toBe(false);
    expect(hint?.dataset.sampledHintKind).toBe("first");

    refreshSampledCursor(stage, { radius: 40 });
    vi.advanceTimersToNextFrame();
    expect(stage.dataset.sampledState).toBe("pick");
  } finally {
    vi.useRealTimers();
  }
});
