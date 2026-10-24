import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatImage,
  ChatSession,
  ChatSnapshot,
  ChatSummary,
  CurrentViewContext,
} from "../../../../shared/chatTypes";
import { chatGateway } from "../../api/chatGateway";
import { noteChatState } from "../../lib/mcpNotificationBatch";
import {
  chatSummary,
  mergeChatSnapshots,
} from "../../../../shared/chatSnapshot";

export function useChat(enabled: boolean) {
  const {
    session,
    setSession,
    history,
    setHistory,
    selected,
    deleted,
    latest,
    revisions,
    accept,
    acceptHistory,
  } = useChatSnapshots();
  const initialized = useRef(false);
  const requestVersion = useRef(0);
  const drafts = useRef(
    new Map<string, { text: string; images: ChatImage[] }>(),
  );
  const { error, busy, perform } = useChatActionRunner();
  const select = useCallback(
    async (id?: string, runtime?: ChatSession["runtime"]): Promise<void> => {
      const version = ++requestVersion.current;
      const value = id
        ? await chatGateway.readChat(id)
        : await chatGateway.createChat(runtime);
      if (version !== requestVersion.current) return;
      selected.current = value.id;
      const cached = latest.current.get(value.id);
      if (cached && cached.updatedAt >= value.updatedAt) {
        setSession(cached);
        accept(cached);
      } else if ((revisions.current.get(value.id) ?? -1) > value.updatedAt) {
        // An evicted push was newer than this read; fetch its durable successor.
        await select(value.id);
      } else accept(value);
    },
    [accept, latest, revisions, selected, setSession],
  );
  useInitialChat(enabled, initialized, perform, select, acceptHistory);
  useEffect(
    () => chatGateway.onChatEvent((event) => accept(event.session)),
    [accept],
  );
  const actions = useChatActions(session, accept, perform, select);
  return {
    session,
    history,
    error,
    busy,
    drafts,
    perform,
    loadOlder: () =>
      perform(async () => {
        if (!session?.itemWindow?.start) return;
        accept(
          await chatGateway.readChat(session.id, session.itemWindow.start),
        );
      }),
    deleteSession: () =>
      perform(async () => {
        if (!session) return;
        await chatGateway.deleteChat(session.id);
        deleted.current.add(session.id);
        drafts.current.delete(session.id);
        latest.current.delete(session.id);
        revisions.current.delete(session.id);
        const remaining = history.filter((entry) => entry.id !== session.id);
        setHistory(remaining);
        selected.current = null;
        setSession(null);
        await select(remaining[0]?.id, session.runtime);
      }),
    ...actions,
  };
}

function useInitialChat(
  enabled: boolean,
  initialized: React.RefObject<boolean>,
  perform: (run: () => Promise<void>) => Promise<void>,
  select: (id?: string, runtime?: ChatSession["runtime"]) => Promise<void>,
  setHistory: (value: ChatSummary[]) => void,
) {
  useEffect(() => {
    if (!enabled || initialized.current) return;
    initialized.current = true;
    void perform(async () => {
      const saved = await chatGateway.listChats();
      setHistory(saved);
      await select(saved.find((value) => !value.loadError)?.id);
    });
  }, [enabled, initialized, perform, select, setHistory]);
}

function useChatActions(
  session: ChatSession | null,
  accept: (value: ChatSnapshot) => void,
  perform: (run: () => Promise<void>) => Promise<void>,
  select: (id?: string, runtime?: ChatSession["runtime"]) => Promise<void>,
) {
  const send = async (
    text: string,
    images: ChatImage[],
    context: CurrentViewContext,
    model: string | null,
    effort: string | null,
  ) => {
    if (!session) return false;
    const value = await chatGateway.sendChat({
      sessionId: session.id,
      messageId: crypto.randomUUID(),
      text,
      imageIds: images.map((image) => image.id),
      context,
      model,
      effort,
    });
    accept(value);
    return true;
  };
  return {
    send,
    select: (id?: string, runtime?: ChatSession["runtime"]) =>
      perform(() => select(id, runtime)),
    stop: () =>
      perform(async () => {
        if (session) accept(await chatGateway.stopChat(session.id));
      }),
    compact: () =>
      perform(async () => {
        if (session) accept(await chatGateway.compactChat(session.id));
      }),
    answer: (answers: Record<string, string>) =>
      perform(async () => {
        if (session?.question)
          accept(
            await chatGateway.answerChat(
              session.id,
              session.question.id,
              answers,
            ),
          );
      }),
  };
}

function useChatSnapshots() {
  const [session, setSession] = useState<ChatSnapshot | null>(null);
  const [history, setHistory] = useState<ChatSummary[]>([]);
  const selected = useRef<string | null>(null);
  const deleted = useRef(new Set<string>());
  const latest = useRef(new Map<string, ChatSnapshot>());
  const revisions = useRef(new Map<string, number>());
  const accept = useCallback((incoming: ChatSnapshot) => {
    const value = mergeChatSnapshots(latest.current.get(incoming.id), incoming);
    if (deleted.current.has(value.id)) return;
    if ((revisions.current.get(value.id) ?? -1) > value.updatedAt) return;
    revisions.current.set(value.id, value.updatedAt);
    latest.current.delete(value.id);
    latest.current.set(value.id, value);
    // Retain in-flight selections without keeping every full conversation alive.
    for (const id of latest.current.keys()) {
      if (latest.current.size <= 4) break;
      if (id !== selected.current) latest.current.delete(id);
    }
    // The panel stays mounted while hidden, so chat turns always end the batch.
    noteChatState(value.id, value.state);
    if (selected.current === value.id)
      setSession((current) =>
        current?.id === value.id && current.updatedAt > value.updatedAt
          ? current
          : value,
      );
    setHistory((current) =>
      [
        chatSummary(value),
        ...current.filter((item) => item.id !== value.id),
      ].sort((a, b) => b.updatedAt - a.updatedAt),
    );
  }, []);
  const acceptHistory = useCallback((values: ChatSummary[]) => {
    setHistory((current) => {
      const entries = new Map(current.map((value) => [value.id, value]));
      for (const value of values) {
        if (deleted.current.has(value.id)) continue;
        if ((revisions.current.get(value.id) ?? -1) > value.updatedAt) continue;
        revisions.current.set(value.id, value.updatedAt);
        entries.set(value.id, value);
      }
      return [...entries.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }, []);
  return {
    session,
    setSession,
    history,
    setHistory,
    selected,
    deleted,
    latest,
    revisions,
    accept,
    acceptHistory,
  };
}

function useChatActionRunner() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const perform = useCallback(async (run: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }, []);
  return { error, busy, perform };
}
