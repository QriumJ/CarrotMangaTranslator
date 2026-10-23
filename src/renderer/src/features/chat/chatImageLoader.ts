import { chatGateway } from "../../api/chatGateway";
import type { ChatImage } from "../../../../shared/chatTypes";

let active = 0;
const queue: (() => void)[] = [];

/** Keep image IPC/decode work bounded; scrolling away discards queued reads. */
export function loadChatImage(
  sessionId: string,
  imageId: string,
  preview: boolean,
  signal: AbortSignal,
): Promise<ChatImage> {
  return new Promise((resolve, reject) => {
    const run = () => {
      if (signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      active++;
      void Promise.resolve()
        .then(() => chatGateway.readChatImage(sessionId, imageId, preview))
        .then(resolve, reject)
        .finally(() => {
          active--;
          drain();
        });
    };
    queue.push(run);
    drain();
  });
}
function drain() {
  while (active < 2 && queue.length) queue.shift()?.();
}
