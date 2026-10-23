import type { ChatSession, ChatSendRequest } from "../../shared/chatTypes";
import type { RuntimeLease } from "./chatRuntimePorts";
import type { ChatRepository } from "../chat/chatRepository";
import { chatMessageInput } from "../chat/chatInstructions";

export async function deliverChatMessage(
  session: ChatSession,
  request: ChatSendRequest,
  ports: {
    stopped: () => boolean;
    runtime: () => Promise<RuntimeLease>;
    save: (session: ChatSession) => Promise<void>;
    repository: Pick<ChatRepository, "image">;
  },
) {
  if (ports.stopped()) return;
  const lease = await ports.runtime();
  if (ports.stopped()) return;
  session.nativeThreadId = await lease.runtime.prepare(session);
  await ports.save(session);
  if (ports.stopped()) return;
  const messageIndex = session.items.findIndex(
    (item) => item.id === request.messageId,
  );
  const messages = session.items
    .slice(0, messageIndex + 1)
    .filter((item) => item.role === "user" && item.delivery === "pending");
  const imageIds = [
    ...new Set(messages.flatMap((item) => item.imageIds ?? [])),
  ];
  const images = await Promise.all(
    imageIds.map((id) => ports.repository.image(session.id, id)),
  );
  if (ports.stopped()) return;
  const text = chatMessageInput(request, session);
  for (const message of messages) message.delivery = "uncertain";
  try {
    await ports.save(session);
  } catch (error) {
    for (const message of messages) message.delivery = "pending";
    throw error;
  }
  if (ports.stopped()) {
    for (const message of messages) message.delivery = "pending";
    await ports.save(session);
    return;
  }
  await lease.runtime.send(
    request.messageId,
    [
      { type: "text", text },
      ...images.map((image) => ({
        type: "image" as const,
        url: image.dataUrl,
      })),
    ],
    request.model,
    request.effort,
  );
  for (const message of messages)
    message.delivery = ports.stopped() ? "uncertain" : "sent";
  await ports.save(session);
}
