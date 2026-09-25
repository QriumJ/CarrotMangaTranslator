import type { IncomingMessage } from "node:http";
import { McpHttpError } from "./mcpHttpPolicy";

const MAX_BODY_BYTES = 64 * 1024;
const BODY_TIMEOUT_MS = 10_000;

export async function readMcpBody(
  request: IncomingMessage,
  maximum = MAX_BODY_BYTES,
): Promise<unknown> {
  const bytes = await readBoundedBody(request, maximum);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } catch (_error) {
    throw new McpHttpError(400, "Invalid UTF-8 JSON body.");
  }
}

export function readBoundedBody(
  request: IncomingMessage,
  maximum = MAX_BODY_BYTES,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let overflow: McpHttpError | undefined;
    const finish = (error?: Error) => {
      clearTimeout(timer);
      request.off("data", onData);
      request.off("end", onEnd);
      request.off("error", onError);
      request.off("aborted", onAborted);
      if (error) {
        request.resume();
        reject(error);
      } else {
        resolve(Buffer.concat(chunks, size));
      }
    };
    const onData = (chunk: Buffer) => {
      if (overflow) return;
      size += chunk.length;
      if (size > maximum) {
        overflow = new McpHttpError(413, "Request body is too large.");
        chunks.length = 0;
      } else chunks.push(chunk);
    };
    // Drain within the existing deadline so closing an oversized upload does not
    // reset the socket before the client can read its actionable 413 response.
    const onEnd = () => finish(overflow);
    const onError = () =>
      finish(new McpHttpError(400, "Request body could not be read."));
    const onAborted = () =>
      finish(new McpHttpError(400, "Request was aborted."));
    const timer = setTimeout(
      () => finish(new McpHttpError(408, "Request body timed out.")),
      BODY_TIMEOUT_MS,
    );
    timer.unref();
    request.on("data", onData);
    request.once("end", onEnd);
    request.once("error", onError);
    request.once("aborted", onAborted);
  });
}
