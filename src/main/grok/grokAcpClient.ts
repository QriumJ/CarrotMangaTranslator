import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { z } from "zod";
import { observeProcessErrors } from "../runtimeSupport/observeProcessErrors";
import {
  forceTerminateChildProcessTree,
  shouldSpawnInOwnProcessGroup,
  createChildExitReceipt,
} from "../runtimeSupport/processTreeTermination";

const envelope = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.object({ message: z.string() }).passthrough().optional(),
});
type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
export type GrokConnection = Pick<
  GrokAcpClient,
  "request" | "close" | "onNotification" | "onRequest" | "onFailure"
>;

/** ACP JSON-RPC over the official CLI's stdio. Credentials never cross this API. */
export class GrokAcpClient {
  private nextId = 0;
  private pending = new Map<number, Pending>();
  private buffer = "";
  private failure: Error | null = null;
  private closing?: Promise<void>;
  private readonly exitReceipt: ReturnType<typeof createChildExitReceipt>;
  onNotification: (method: string, params: unknown) => void = () => undefined;
  onRequest: (method: string, params: unknown) => Promise<unknown> =
    async () => {
      throw new Error("Unsupported Grok client request");
    };
  onFailure: (error: Error) => void = () => undefined;

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    this.exitReceipt = createChildExitReceipt(child);
    observeProcessErrors(child, (error) => this.fail(error));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.accept(chunk));
    // CLI diagnostics can contain account metadata. Drain without logging them.
    child.stderr.resume();
    child.once("exit", () =>
      this.fail(new Error("Grok 연결이 종료되었습니다.")),
    );
  }
  static start(
    executable: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
  ): GrokConnection {
    return new GrokAcpClient(
      spawn(executable, args, {
        cwd,
        env,
        windowsHide: true,
        stdio: "pipe",
        detached: shouldSpawnInOwnProcessGroup(),
      }),
    );
  }
  request(
    method: string,
    params: unknown,
    timeoutMs = 30_000,
  ): Promise<unknown> {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Grok 요청 시간이 초과되었습니다: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ id, method, params });
    });
  }
  notify(method: string, params: unknown) {
    if (!this.failure) this.write({ method, params });
  }
  close(): Promise<void> {
    if (!this.closing) {
      this.fail(new Error("Grok 연결을 닫았습니다."), false);
      this.closing = this.shutdown();
    }
    return this.closing;
  }
  private async shutdown() {
    // EOF lets the official CLI flush its session before exiting. Force-kill is
    // reserved for a worker that cannot finish; killing immediately can race save.
    this.child.stdin.end();
    if (this.exitReceipt.hasExited()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.exitReceipt.promise,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 3_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (!this.exitReceipt.hasExited())
      await forceTerminateChildProcessTree(this.child);
  }
  private write(value: Record<string, unknown>) {
    try {
      this.child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", ...value }) + "\n",
      );
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
  private accept(chunk: string) {
    if (this.failure) return;
    this.buffer += chunk;
    if (this.buffer.length > 16 * 1024 * 1024) {
      this.fail(new Error("Grok 응답 크기 제한을 초과했습니다."));
      return;
    }
    let boundary: number;
    while ((boundary = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 1);
      if (!line.trim()) continue;
      try {
        const message = envelope.parse(JSON.parse(line));
        if (message.method && message.id !== undefined) {
          const id = message.id;
          void this.onRequest(message.method, message.params).then(
            (result) => {
              if (!this.failure) this.write({ id, result });
            },
            () => {
              if (!this.failure)
                this.write({
                  id,
                  error: {
                    code: -32601,
                    message: "Unsupported client request",
                  },
                });
            },
          );
        } else if (message.method) {
          this.onNotification(message.method, message.params);
        } else if (typeof message.id === "number") {
          this.complete(message.id, message);
        }
      } catch (_error) {
        this.fail(new Error("Grok ACP 응답을 해석하지 못했습니다."));
      }
    }
  }
  private complete(id: number, message: z.infer<typeof envelope>) {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (message.error)
      pending.reject(
        new Error(message.error.message, { cause: message.error.data }),
      );
    else pending.resolve(message.result);
  }
  private fail(error: Error, report = true) {
    if (this.failure) return;
    this.failure = error;
    this.buffer = "";
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    if (report) this.onFailure(error);
  }
}
