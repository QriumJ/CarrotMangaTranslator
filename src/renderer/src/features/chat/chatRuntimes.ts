import type { ChatSession } from "../../../../shared/chatTypes";

export type ChatRuntime = ChatSession["runtime"];

/** Assistant order in the picker and the name shown in history and replies. */
export const CHAT_RUNTIME_LABELS = {
  codex: "Codex",
  claude: "Claude",
  grok: "Grok",
} as const satisfies Record<ChatRuntime, string>;

export const CHAT_RUNTIMES = Object.keys(CHAT_RUNTIME_LABELS) as ChatRuntime[];
