/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { initializeAppI18n } from "../src/renderer/src/appI18n";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import { useAccountAuthOperation } from "../src/renderer/src/hooks/useAccountAuthOperation";
import type { AppOperationActivityEvent } from "../src/shared/appOperationTypes";

afterEach(cleanup);

it("does not resurrect a completed download after switching away and back", async () => {
  await initializeAppI18n("ko");
  const listeners = new Set<(event: AppOperationActivityEvent) => void>();
  const cancel = vi.fn(async () => ({ accepted: true }));
  window.mangaApi = createTestMangaGatewayStub({
    getActiveAppOperations: async () => [],
    onAppOperationActivity: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    cancelAppOperation: cancel,
  });
  const { result, rerender } = renderHook(
    ({ kind }: { kind: "claude-auth" | "codex-auth" }) =>
      useAccountAuthOperation(kind),
    { initialProps: { kind: "claude-auth" as "claude-auth" | "codex-auth" } },
  );
  await act(async () => {});
  const activity: AppOperationActivityEvent = {
    id: "old",
    kind: "claude-auth",
    status: "running",
    phase: "cli-downloading",
    mutatesLibrary: false,
    cancellable: true,
    startedAt: 1,
    updatedAt: 2,
  };
  act(() => listeners.forEach((listener) => listener(activity)));
  expect(result.current.activity?.id).toBe("old");
  rerender({ kind: "codex-auth" });
  await act(async () => {});
  act(() =>
    listeners.forEach((listener) =>
      listener({ ...activity, status: "completed", updatedAt: 3 }),
    ),
  );
  rerender({ kind: "claude-auth" });
  await act(async () => {});
  expect(result.current.activity).toBeNull();
  act(() => result.current.cancel());
  expect(cancel).not.toHaveBeenCalled();
});
