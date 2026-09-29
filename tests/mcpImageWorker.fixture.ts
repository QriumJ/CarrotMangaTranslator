import { EventEmitter } from "node:events";
import { McpEditError } from "../src/main/application/mcpEditPolicy";
import { executeMcpImageWorkerRequest } from "../src/main/mcp/mcpImageWorkerOperations";
import type { McpImageWorkerRequest } from "../src/main/mcp/mcpImageWorkerProtocol";

/** Native transport boundary only; uploaded files, parsers and pixel kernels stay real. */
class InProcessImageWorker extends EventEmitter {
  private closed = false;
  postMessage(request: McpImageWorkerRequest): void {
    const input = structuredClone(request);
    void executeMcpImageWorkerRequest(input).then(
      (result) => {
        if (!this.closed) this.emit("message", structuredClone(result));
      },
      (error: unknown) => {
        if (!this.closed)
          this.emit("message", {
            id: request.id,
            error:
              error instanceof McpEditError
                ? { name: error.name, message: error.message, code: error.code }
                : { name: "Error", message: String(error) },
          });
      },
    );
  }
  async terminate(): Promise<number> {
    this.closed = true;
    this.emit("exit", 0);
    return 0;
  }
}
export const createImageWorkerBoundary = () => new InProcessImageWorker();
