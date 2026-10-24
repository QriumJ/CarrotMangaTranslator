import { z } from "zod";
import { defineIpcContract } from "./ipcContractCore";
import {
  ChatImageSchema,
  ChatSendRequestSchema,
  ChatSnapshotSchema,
  ChatSummarySchema,
} from "./chatSchemas";
import type {
  ChatImage,
  ChatSendRequest,
  ChatSession,
  ChatSnapshot,
  ChatSummary,
} from "./chatTypes";

const id = z.string().uuid();
export const chatIpcContracts = {
  listChats: defineIpcContract<[], ChatSummary[]>({
    apiKey: "listChats",
    channel: "chat:list",
    args: z.tuple([]),
    result: z.array(ChatSummarySchema),
  }),
  createChat: defineIpcContract<[ChatSession["runtime"]?], ChatSnapshot>({
    apiKey: "createChat",
    channel: "chat:create",
    args: z.tuple([z.enum(["codex", "claude", "grok"]).optional()]),
    result: ChatSnapshotSchema,
  }),
  readChat: defineIpcContract<[string, number?], ChatSnapshot>({
    apiKey: "readChat",
    channel: "chat:read",
    args: z.tuple([id, z.number().int().nonnegative().optional()]),
    result: ChatSnapshotSchema,
  }),
  deleteChat: defineIpcContract<[string], void>({
    apiKey: "deleteChat",
    channel: "chat:delete",
    args: z.tuple([id]),
    result: z.void(),
  }),
  sendChat: defineIpcContract<[ChatSendRequest], ChatSnapshot>({
    apiKey: "sendChat",
    channel: "chat:send",
    args: z.tuple([ChatSendRequestSchema]),
    result: ChatSnapshotSchema,
  }),
  stopChat: defineIpcContract<[string], ChatSnapshot>({
    apiKey: "stopChat",
    channel: "chat:stop",
    args: z.tuple([id]),
    result: ChatSnapshotSchema,
  }),
  compactChat: defineIpcContract<[string], ChatSnapshot>({
    apiKey: "compactChat",
    channel: "chat:compact",
    args: z.tuple([id]),
    result: ChatSnapshotSchema,
  }),
  answerChat: defineIpcContract<
    [string, string, Record<string, string>],
    ChatSnapshot
  >({
    apiKey: "answerChat",
    channel: "chat:answer",
    args: z.tuple([id, z.string(), z.record(z.string(), z.string())]),
    result: ChatSnapshotSchema,
  }),
  attachChatImage: defineIpcContract<[string, string, string], ChatImage>({
    apiKey: "attachChatImage",
    channel: "chat:attach-image",
    args: z.tuple([id, z.string().max(256), z.string().max(28 * 1024 * 1024)]),
    result: ChatImageSchema,
  }),
  readChatImage: defineIpcContract<[string, string, boolean?], ChatImage>({
    apiKey: "readChatImage",
    channel: "chat:read-image",
    args: z.tuple([id, id, z.boolean().optional()]),
    result: ChatImageSchema,
  }),
};
