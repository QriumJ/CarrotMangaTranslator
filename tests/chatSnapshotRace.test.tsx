/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useChat } from "../src/renderer/src/features/chat/useChat";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import { resetMcpNotificationBatch } from "../src/renderer/src/lib/mcpNotificationBatch";
import { createAccountConnection } from "../src/renderer/src/api/accountConnection";
import { useAccountConnection } from "../src/renderer/src/hooks/useAccountConnection";
import type { ChatSession, ChatEvent } from "../src/shared/chatTypes";
import { chatSnapshot } from "../src/shared/chatSnapshot";

it("loads earlier transcript pages without replacing newer live text", async () => {
  const source = {
    ...initial,
    items: Array.from({ length: 161 }, (_, n) => ({
      id: String(n),
      role: "assistant" as const,
      text: String(n),
      state: "completed" as const,
      createdAt: n,
    })),
  };
  let emit!: (event: ChatEvent) => void;
  window.mangaApi = createTestMangaGatewayStub({
    listChats: async () => [source],
    readChat: async (_id, before) => chatSnapshot(source, before),
    onChatEvent: (cb) => {
      emit = cb;
      return () => undefined;
    },
  });
  const hook = renderHook(() => useChat(true));
  await waitFor(() =>
    expect(hook.result.current.session?.items.length).toBe(80),
  );
  act(() =>
    emit({
      sessionId: source.id,
      session: chatSnapshot({
        ...source,
        updatedAt: 5,
        items: source.items.map((item) =>
          item.id === "160" ? { ...item, text: "newer" } : item,
        ),
      }),
    }),
  );
  await act(() => hook.result.current.loadOlder());
  expect(hook.result.current.session?.items).toHaveLength(160);
  expect(hook.result.current.session?.items.at(-1)?.text).toBe("newer");
  await act(() => hook.result.current.loadOlder());
  expect(hook.result.current.session?.items).toHaveLength(161);
});

afterEach(() => {
  cleanup();
  resetMcpNotificationBatch();
});
const initial: ChatSession = {
  version: 1,
  id: "00000000-0000-4000-a000-000000000001",
  title: "A",
  runtime: "codex",
  nativeThreadId: null,
  model: null,
  effort: null,
  state: "idle",
  createdAt: 1,
  updatedAt: 1,
  items: [],
  checkpoint: [],
  question: null,
};

it("a failed old account poll preserves a newer successful login", async () => {
  let reject!: (reason: Error) => void;
  const pending = new Promise<{ authenticated: boolean }>((_done, fail) => {
    reject = fail;
  });
  const connection = createAccountConnection(() => pending);
  const hook = renderHook(() => useAccountConnection(connection, true));
  act(() => connection.publish({ authenticated: true }));
  expect(hook.result.current.account?.authenticated).toBe(true);
  await act(async () => {
    reject(new Error("old poll failed"));
    await Promise.allSettled([pending]);
  });
  expect(hook.result.current.account?.authenticated).toBe(true);
});

it("stale snapshots roll back history even while the selected transcript rejects them", async () => {
  let emit!: (event: ChatEvent) => void;
  window.mangaApi = createTestMangaGatewayStub({
    listChats: async () => [initial],
    readChat: async () => initial,
    onChatEvent: (callback) => {
      emit = callback;
      return () => undefined;
    },
  });
  const hook = renderHook(() => useChat(true));
  await waitFor(() => expect(hook.result.current.session?.id).toBe(initial.id));
  act(() =>
    emit({
      sessionId: initial.id,
      session: { ...initial, state: "running", updatedAt: 3 },
    }),
  );
  act(() =>
    emit({
      sessionId: initial.id,
      session: { ...initial, state: "idle", updatedAt: 2 },
    }),
  );
  expect(hook.result.current.session?.state).toBe("running");
  expect(hook.result.current.history[0].state).toBe("running");
  expect(hook.result.current.history[0].updatedAt).toBe(3);
});

it("selecting another chat loses a newer completion that arrives before its older read response", async () => {
  let emit!: (event: ChatEvent) => void;
  let release!: (session: ChatSession) => void;
  const other = {
    ...initial,
    id: "00000000-0000-4000-a000-000000000002",
    title: "B",
    state: "running" as const,
    updatedAt: 2,
  };
  const pending = new Promise<ChatSession>((done) => {
    release = done;
  });
  window.mangaApi = createTestMangaGatewayStub({
    listChats: async () => [initial, other],
    readChat: async (id) => (id === initial.id ? initial : pending),
    onChatEvent: (callback) => {
      emit = callback;
      return () => undefined;
    },
  });
  const hook = renderHook(() => useChat(true));
  await waitFor(() => expect(hook.result.current.session?.id).toBe(initial.id));
  let selected!: Promise<void>;
  act(() => {
    selected = hook.result.current.select(other.id);
  });
  act(() =>
    emit({
      sessionId: other.id,
      session: {
        ...other,
        state: "idle",
        updatedAt: 3,
        items: [
          {
            id: "final",
            role: "assistant",
            text: "완료",
            state: "completed",
            createdAt: 3,
          },
        ],
      },
    }),
  );
  await act(async () => {
    release(other);
    await selected;
  });
  expect(hook.result.current.session?.id).toBe(other.id);
  expect(hook.result.current.session?.state).toBe("idle");
  expect(hook.result.current.session?.items[0].text).toBe("완료");
});
