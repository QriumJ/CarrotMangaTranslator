import { afterEach, expect, it, vi } from "vitest";
import {
  prepareAppUpdateInstallation,
  type AppUpdateInstallationPort,
} from "../src/main/application/appUpdateInstallation";
import { AppUpdateError } from "../src/main/application/appUpdateRelease";
import { AppActivityGate } from "../src/main/appActivityGate";

function setup(overrides: Partial<AppUpdateInstallationPort> = {}) {
  const releaseWork = vi.fn(),
    releaseEditors = vi.fn(),
    releaseAccess = vi.fn(),
    releaseMutations = vi.fn();
  const port: AppUpdateInstallationPort = {
    suspendWork: () => releaseWork,
    lockAndFlushEditors: async () => releaseEditors,
    assertReady: vi.fn(),
    drainAccess: async () => releaseAccess,
    suspendMutations: () => releaseMutations,
    drainMutations: async () => undefined,
    disposeRuntimes: async () => undefined,
    launch: vi.fn(async () => undefined),
    ...overrides,
  };
  return { port, releaseWork, releaseEditors, releaseAccess, releaseMutations };
}
afterEach(() => vi.useRealTimers());

it("blocks new work before flushing and waits for every drain before launch", async () => {
  const gate = new AppActivityGate();
  let finish!: () => void;
  const { port } = setup({
    suspendWork: () => gate.suspendNewActivities().release,
    drainMutations: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  });
  const task = prepareAppUpdateInstallation(port);
  expect(gate.isUnavailable).toBe(true);
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  expect(port.launch).not.toHaveBeenCalled();
  finish();
  await task;
  expect(port.launch).toHaveBeenCalledTimes(1);
  expect(gate.isUnavailable).toBe(true);
});

it.each([
  "lockAndFlushEditors",
  "drainAccess",
  "drainMutations",
  "disposeRuntimes",
  "launch",
] as const)(
  "unlocks the app when %s fails, without retrying installation",
  async (stage) => {
    const error = new AppUpdateError("save", "test failure");
    const state = setup({
      [stage]: vi.fn(async () => {
        throw error;
      }),
    });
    await expect(prepareAppUpdateInstallation(state.port)).rejects.toThrow(
      "test failure",
    );
    expect(state.releaseWork).toHaveBeenCalledTimes(1);
    if (stage !== "lockAndFlushEditors")
      expect(state.releaseEditors).toHaveBeenCalledTimes(1);
    if (stage !== "launch") expect(state.port.launch).not.toHaveBeenCalled();
  },
);

it("rejects a window/task race after flushing", async () => {
  const state = setup({
    assertReady: () => {
      throw new AppUpdateError("busy", "new task");
    },
  });
  await expect(prepareAppUpdateInstallation(state.port)).rejects.toMatchObject({
    code: "busy",
  });
  expect(state.port.launch).not.toHaveBeenCalled();
  expect(state.releaseEditors).toHaveBeenCalled();
});

it("never launches from a late file-write completion after the preparation deadline", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const state = setup({
    drainMutations: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  });
  const rejected = expect(
    prepareAppUpdateInstallation(state.port),
  ).rejects.toMatchObject({ code: "save" });
  await vi.advanceTimersByTimeAsync(15_001);
  await rejected;
  finish();
  await Promise.resolve();
  expect(state.port.launch).not.toHaveBeenCalled();
  expect(state.releaseWork).toHaveBeenCalled();
  expect(state.releaseMutations).toHaveBeenCalled();
});
