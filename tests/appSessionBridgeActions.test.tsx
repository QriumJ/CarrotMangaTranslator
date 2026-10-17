/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import { useAppSessionBridgeActions } from "../src/renderer/src/app/session/useAppSessionBridgeActions";

afterEach(() => {
  window.mangaApi = createTestMangaGatewayStub();
  vi.clearAllMocks();
});

describe("app session bridge actions", () => {
  it.each([false, true])(
    "opens the model folder and surfaces failures: %s",
    async (fails) => {
      const openModelFolder = vi.fn(async () => {
        if (fails) throw new Error("Explorer unavailable");
        return { opened: true };
      });
      window.mangaApi = createTestMangaGatewayStub({ openModelFolder });
      const pushStatus = vi.fn();
      const { result } = renderHook(() =>
        useAppSessionBridgeActions(pushStatus),
      );
      act(() => result.current.openModelFolder());
      await waitFor(() => expect(openModelFolder).toHaveBeenCalledOnce());
      if (fails) {
        await waitFor(() =>
          expect(pushStatus).toHaveBeenCalledWith(
            "모델 폴더를 열지 못했습니다.",
          ),
        );
      } else {
        expect(pushStatus).not.toHaveBeenCalled();
      }
    },
  );
  it("cancels the displayed job even when another job became the main default", async () => {
    const cancelJob = vi.fn(async () => ({ cancelled: true }));
    window.mangaApi = createTestMangaGatewayStub({ cancelJob });
    const { result } = renderHook(() =>
      useAppSessionBridgeActions(vi.fn(), undefined, "displayed-export"),
    );
    act(() => result.current.cancelJob());
    await waitFor(() =>
      expect(cancelJob).toHaveBeenCalledWith({ jobId: "displayed-export" }),
    );
  });
  it("latches aggregate cancellation before sending the main-process request", async () => {
    const calls: string[] = [];
    const cancelJob = vi.fn(async () => {
      calls.push("ipc");
      return { cancelled: false };
    });
    window.mangaApi = createTestMangaGatewayStub({ cancelJob });
    const requestFlowCancellation = vi.fn(() => calls.push("flow"));
    const { result } = renderHook(() =>
      useAppSessionBridgeActions(vi.fn(), requestFlowCancellation),
    );

    act(() => result.current.cancelJob());

    expect(requestFlowCancellation).toHaveBeenCalledOnce();
    await waitFor(() => expect(cancelJob).toHaveBeenCalledOnce());
    expect(calls).toEqual(["flow", "ipc"]);
  });
});
