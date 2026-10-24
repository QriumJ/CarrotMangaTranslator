/** @vitest-environment jsdom */
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChatImages } from "../src/renderer/src/features/chat/ChatImages";
import { loadChatImage } from "../src/renderer/src/features/chat/chatImageLoader";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import { initializeAppI18n } from "../src/renderer/src/appI18n";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("bounds concurrent reads and skips cancelled queued attachments", async () => {
  const releases: (() => void)[] = [];
  const read = vi.fn(async (_id: string, imageId: string) => {
    await new Promise<void>((resolve) => releases.push(resolve));
    return {
      id: imageId,
      name: imageId,
      dataUrl: "data:image/png;base64,AA==",
    };
  });
  window.mangaApi = createTestMangaGatewayStub({ readChatImage: read });
  const controls = Array.from({ length: 4 }, () => new AbortController());
  const pending = controls.map((control, index) =>
    loadChatImage("session", String(index), true, control.signal),
  );
  const settled = Promise.allSettled(pending);
  await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  controls[2].abort();
  releases.shift()?.();
  await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
  expect(read.mock.calls.map((call) => call[1])).toEqual(["0", "1", "3"]);
  for (const release of releases) release();
  expect((await settled).map((value) => value.status)).toEqual([
    "fulfilled",
    "fulfilled",
    "rejected",
    "fulfilled",
  ]);
});

it("loads only visible thumbnails, deduplicates references and releases offscreen content", async () => {
  await initializeAppI18n("ko");
  let visibility!: IntersectionObserverCallback;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        visibility = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const read = vi.fn(async (_id: string, id: string) => ({
    id,
    name: "원본",
    dataUrl: "data:image/png;base64,AA==",
  }));
  window.mangaApi = createTestMangaGatewayStub({ readChatImage: read });
  render(<ChatImages sessionId="session" ids={["image", "image"]} />);
  expect(read).not.toHaveBeenCalled();
  act(() =>
    visibility(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
  expect(await screen.findAllByRole("img")).toHaveLength(1);
  expect(read).toHaveBeenCalledWith("session", "image", true);
  act(() =>
    visibility(
      [{ isIntersecting: false } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    ),
  );
  await waitFor(() => expect(screen.queryByRole("img")).toBeNull());
});

it("fetches original bytes only on opening and closes the preview without losing thumbnails", async () => {
  await initializeAppI18n("ko");
  vi.stubGlobal("IntersectionObserver", undefined);
  const read = vi.fn(
    async (_session: string, id: string, preview?: boolean) => ({
      id,
      name: "페이지",
      dataUrl: preview
        ? "data:image/png;base64,AA=="
        : "data:image/png;base64,AQ==",
    }),
  );
  window.mangaApi = createTestMangaGatewayStub({ readChatImage: read });
  render(<ChatImages sessionId="session" ids={["image"]} />);
  fireEvent.click(await screen.findByRole("button", { name: "페이지" }));
  await waitFor(() =>
    expect(read).toHaveBeenCalledWith("session", "image", false),
  );
  await waitFor(() =>
    expect(screen.getAllByRole("img")[1].getAttribute("src")).toBe(
      "data:image/png;base64,AQ==",
    ),
  );
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getAllByRole("img")).toHaveLength(1);
});

it("reveals older attachments on demand and displays a failed image read", async () => {
  await initializeAppI18n("ko");
  vi.stubGlobal("IntersectionObserver", undefined);
  const read = vi.fn(async (_session: string, id: string) => {
    if (id === "0") throw new Error("이미지를 읽을 수 없습니다.");
    return { id, name: id, dataUrl: "data:image/png;base64,AA==" };
  });
  window.mangaApi = createTestMangaGatewayStub({ readChatImage: read });
  render(
    <ChatImages
      sessionId="session"
      ids={Array.from({ length: 21 }, (_, i) => String(i))}
    />,
  );
  await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(20));
  expect(read).not.toHaveBeenCalledWith("session", "0", true);
  fireEvent.click(screen.getByText("+1"));
  expect((await screen.findByRole("status")).textContent).toBe(
    "이미지를 읽을 수 없습니다.",
  );
  expect(screen.queryByText("+1")).toBeNull();
});
