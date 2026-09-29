import { parentPort } from "node:worker_threads";
import { McpEditError } from "../application/mcpEditPolicy";
import { executeMcpImageWorkerRequest } from "./mcpImageWorkerOperations";
import type {
  McpImageWorkerRequest,
  McpImageWorkerResponse,
} from "./mcpImageWorkerProtocol";

const port = parentPort;
if (!port) throw new Error("mcpImageWorker must run in a worker thread.");
const workerPort = port;

workerPort.on("message", (request: McpImageWorkerRequest) => {
  void executeMcpImageWorkerRequest(request)
    .then((response) =>
      workerPort.postMessage(response, transferResults(response)),
    )
    .catch((error: unknown) =>
      workerPort.postMessage({
        id: request.id,
        error: serializeError(error),
      } satisfies McpImageWorkerResponse),
    );
});
function transferResults(
  response: Exclude<McpImageWorkerResponse, { error: unknown }>,
): ArrayBuffer[] {
  if (response.kind === "validate") return [];
  const result = response.result;
  const binary = "bytes" in result ? result.bytes : result.bitmap;
  return [binary.buffer as ArrayBuffer, result.mask.buffer as ArrayBuffer];
}
function serializeError(error: unknown) {
  return error instanceof McpEditError &&
    (error.code === "revision_conflict" || error.code === "invalid_edit")
    ? { name: error.name, message: error.message, code: error.code }
    : error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: "Error", message: "Image worker failed." };
}
