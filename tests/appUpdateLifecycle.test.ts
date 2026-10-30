// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import { initializeAppUpdates } from "../src/renderer/src/lib/appUpdateLifecycle";
import { pendingPageEdits } from "../src/renderer/src/lib/pageEditBarrier";
import type { AppUpdatePreparation } from "../src/shared/appUpdate";

const dispose: (() => void)[] = [];
afterEach(() => {
  for (const release of dispose.splice(0).reverse()) release();
});

function setup(flush: () => Promise<void>) {
  let prepare!: (request: AppUpdatePreparation) => void;
  const acknowledge = vi.fn(async () => true);
  window.mangaApi = createTestMangaGatewayStub({
    acknowledgeAppUpdate: acknowledge,
    onAppUpdatePreparation: (callback) => {
      prepare = callback;
      return () => {};
    },
    onAppUpdateState: () => () => {},
    getAppUpdateState: async () => ({
      revision: 0,
      currentVersion: "3.7.8",
      platform: "windows",
      supported: true,
      checkOnStartup: true,
      phase: "ready",
      busy: false,
    }),
  });
  const root = document.createElement("main");
  root.inert = false;
  document.body.append(root);
  dispose.push(() => root.remove());
  dispose.push(pendingPageEdits.registerEnvironmentFlusher(flush));
  dispose.push(initializeAppUpdates(root));
  return { root, acknowledge, prepare };
}

it("blocks new input and acknowledges saving only after the real edit barrier drains", async () => {
  let finish!: () => void;
  const state = setup(() => new Promise<void>((resolve) => (finish = resolve)));
  const request = { id: "update-one" };
  state.prepare({ ...request, stage: "lock" });
  state.prepare({ ...request, stage: "lock" });
  expect(state.root.inert).toBe(true);
  const input = new InputEvent("beforeinput", {
    cancelable: true,
    bubbles: true,
  });
  state.root.dispatchEvent(input);
  expect(input.defaultPrevented).toBe(true);
  state.prepare({ ...request, stage: "flush" });
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  expect(state.acknowledge).not.toHaveBeenCalledWith({
    ...request,
    stage: "flush",
  });
  finish();
  await vi.waitFor(() =>
    expect(state.acknowledge).toHaveBeenCalledWith({
      ...request,
      stage: "flush",
    }),
  );
  state.prepare({ ...request, stage: "release" });
  expect(state.root.inert).toBe(false);
  const next = new InputEvent("beforeinput", {
    cancelable: true,
    bubbles: true,
  });
  state.root.dispatchEvent(next);
  expect(next.defaultPrevented).toBe(false);
});

it("reports a failed editor save and restores input only when preparation is released", async () => {
  const state = setup(async () => {
    throw new Error("disk write failed");
  });
  state.prepare({ id: "update-two", stage: "lock" });
  state.prepare({ id: "update-two", stage: "flush" });
  await vi.waitFor(() =>
    expect(state.acknowledge).toHaveBeenCalledWith({
      id: "update-two",
      stage: "flush",
      error: "Error: disk write failed",
    }),
  );
  state.prepare({ id: "stale-update", stage: "release" });
  expect(state.root.inert).toBe(true);
  state.prepare({ id: "update-two", stage: "release" });
  expect(state.root.inert).toBe(false);
});

it("rejects an expired save request instead of approving installation", async () => {
  const flush = vi.fn(async () => {});
  const state = setup(flush);
  state.prepare({ id: "expired", stage: "flush" });
  await vi.waitFor(() =>
    expect(state.acknowledge).toHaveBeenCalledWith({
      id: "expired",
      stage: "flush",
      error: "Error: Update preparation expired",
    }),
  );
  expect(flush).not.toHaveBeenCalled();
});
