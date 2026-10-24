import type { ChatSession, ChatSnapshot, ChatSummary } from "./chatTypes";

export function chatSummary(value: ChatSummary): ChatSummary {
  const { id, title, state, updatedAt, model, effort, runtime, loadError } =
    value;
  return {
    id,
    title,
    state,
    updatedAt,
    model,
    effort,
    runtime,
    ...(loadError ? { loadError } : {}),
  };
}

/** View projection only. The stored transcript and provider history remain intact. */
export function chatSnapshot(
  session: ChatSession,
  before = session.items.length,
): ChatSnapshot {
  const end = Math.min(Math.max(0, before), session.items.length);
  const start = Math.max(0, end - 80);
  return structuredClone({
    ...session,
    items: session.items.slice(start, end),
    checkpoint: [],
    itemWindow: { start, total: session.items.length },
  });
}

export function mergeChatSnapshots(
  current: ChatSnapshot | undefined,
  incoming: ChatSnapshot,
): ChatSnapshot {
  if (!current || current.id !== incoming.id) return incoming;
  const latest = current.updatedAt > incoming.updatedAt ? current : incoming;
  if (!current.itemWindow || !incoming.itemWindow) return latest;
  const a = current.itemWindow.start,
    b = incoming.itemWindow.start;
  if (a + current.items.length < b || b + incoming.items.length < a)
    return latest;
  const start = Math.min(a, b);
  const items = [];
  const end = Math.max(a + current.items.length, b + incoming.items.length);
  for (let index = start; index < end; index++) {
    const old = current.items[index - a],
      next = incoming.items[index - b];
    const item = preferredItem(latest === incoming, old, next);
    if (item) items.push(item);
  }
  return {
    ...latest,
    items,
    itemWindow: { start, total: latest.itemWindow?.total ?? end },
  };
}

function preferredItem(
  incoming: boolean,
  old: ChatSession["items"][number] | undefined,
  next: ChatSession["items"][number] | undefined,
) {
  return incoming ? (next ?? old) : (old ?? next);
}
