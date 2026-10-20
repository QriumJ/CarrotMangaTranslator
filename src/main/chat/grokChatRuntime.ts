import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppPaths } from "../appPaths";
import type { ChatSession } from "../../shared/chatTypes";
import type {
  AgentRuntime,
  AgentRuntimeEvents,
} from "../application/chatRuntimePorts";
import { startGrokRuntime } from "../grok/grokRuntime";
import { CHAT_INSTRUCTIONS } from "./chatInstructions";

const updateSchema = z.object({
  sessionId: z.string(),
  update: z
    .object({
      sessionUpdate: z.string(),
      toolCallId: z.string().optional(),
      title: z.string().optional(),
      status: z.string().optional(),
      rawInput: z.unknown().optional(),
      rawOutput: z.unknown().optional(),
      content: z.unknown().optional(),
    })
    .passthrough(),
});
const questionSchema = z.object({
  sessionId: z.string(),
  toolCallId: z.string(),
  questions: z.array(
    z.object({
      question: z.string(),
      options: z
        .array(
          z.object({ label: z.string(), description: z.string().default("") }),
        )
        .default([]),
    }),
  ),
});
const permissionSchema = z.object({
  sessionId: z.string(),
  toolCall: z.object({
    rawInput: z
      .object({ tool_name: z.string().optional() })
      .passthrough()
      .optional(),
  }),
  options: z.array(z.object({ optionId: z.string(), kind: z.string() })),
});

export class GrokChatRuntime implements AgentRuntime {
  private runtime?: Awaited<ReturnType<typeof startGrokRuntime>>;
  private threadId = "";
  private generation = 0;
  private text: { id: string; value: string } | null = null;
  private questions = new Map<string, (answer: unknown) => void>();
  private choice: { model: string | null; effort: string | null } = {
    model: null,
    effort: null,
  };
  constructor(
    private readonly paths: AppPaths,
    private readonly connection: { url: string; token: string },
    private readonly events: AgentRuntimeEvents,
    private readonly start = startGrokRuntime,
  ) {}
  async prepare(session: ChatSession): Promise<string> {
    if (this.runtime) return this.threadId;
    const generation = this.generation;
    const runtime = await this.start(this.paths, CHAT_INSTRUCTIONS);
    if (generation !== this.generation) {
      await runtime.client.close();
      return this.threadId;
    }
    this.runtime = runtime;
    try {
      if (
        !runtime.initialization.authMethods.some(
          (method) => method.id === "cached_token",
        )
      )
        throw new Error("앱 설정에서 Grok 계정으로 로그인해 주세요.");
      await runtime.client.request("authenticate", {
        methodId: "cached_token",
        _meta: { headless: true },
      });
      const params = {
        cwd: runtime.cwd,
        mcpServers: [
          {
            type: "http",
            name: "carrot",
            url: this.connection.url,
            headers: [
              {
                name: "Authorization",
                value: `Bearer ${this.connection.token}`,
              },
            ],
          },
        ],
      };
      if (session.nativeThreadId) {
        await runtime.client.request("session/load", {
          ...params,
          sessionId: session.nativeThreadId,
        });
        this.threadId = session.nativeThreadId;
      } else {
        const created = z
          .object({ sessionId: z.string() })
          .parse(await runtime.client.request("session/new", params));
        this.threadId = created.sessionId;
      }
      this.choice = { model: session.model, effort: session.effort };
      // session/load replays history. Subscribe only after the app's persisted
      // transcript has been resumed, so old replies are never appended twice.
      runtime.client.onNotification = (method, value) =>
        this.notification(method, value);
      runtime.client.onRequest = (method, value) => this.request(method, value);
      runtime.client.onFailure = this.events.failed;
      return this.threadId;
    } catch (error) {
      await this.close();
      throw error;
    }
  }
  async send(
    _messageId: string,
    input: Parameters<AgentRuntime["send"]>[1],
    model: string | null,
    effort: string | null,
  ) {
    const runtime = this.runtime;
    if (!runtime) throw new Error("Grok 대화를 먼저 연결해 주세요.");
    const generation = this.generation;
    if (model)
      await runtime.client.request("session/set_model", {
        sessionId: this.threadId,
        modelId: model,
      });
    if (effort)
      await runtime.client.request("session/set_config_option", {
        sessionId: this.threadId,
        configId: "reasoning_effort",
        value: effort,
      });
    if (generation !== this.generation) return;
    this.choice = { model, effort };
    const prompt = input.map((block) => {
      if (block.type === "text") return block;
      const match =
        /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(
          block.url,
        );
      if (!match)
        throw new Error("Grok에 전달할 이미지 형식이 올바르지 않습니다.");
      // CLI 1.0.62 accepts standard ACP image blocks despite advertising image:false.
      // Verified with actual image recognition; do not silently omit attachments.
      return { type: "image", mimeType: match[1], data: match[2] };
    });
    this.events.notification({ kind: "started" });
    try {
      const result = z
        .object({
          stopReason: z.string(),
          _meta: z
            .object({ totalTokens: z.number().optional() })
            .passthrough()
            .optional(),
        })
        .parse(
          await runtime.client.request(
            "session/prompt",
            { sessionId: this.threadId, prompt },
            30 * 60_000,
          ),
        );
      if (generation !== this.generation) return;
      this.finishText();
      if (result._meta?.totalTokens !== undefined)
        this.events.notification({
          kind: "usage",
          totalTokens: result._meta.totalTokens,
        });
      this.events.notification({
        kind: "finished",
        status: result.stopReason === "cancelled" ? "interrupted" : "completed",
      });
    } catch (error) {
      if (generation !== this.generation) return;
      this.finishText();
      throw error;
    }
  }
  async stop() {
    await this.close();
  }
  async compact() {
    await this.send(
      randomUUID(),
      [{ type: "text", text: "/compact" }],
      this.choice.model,
      this.choice.effort,
    );
  }
  answer(id: string, answers: Record<string, string>) {
    const resolve = this.questions.get(id);
    if (!resolve)
      throw new Error("이 질문은 더 이상 응답을 기다리지 않습니다.");
    this.questions.delete(id);
    resolve({
      outcome: "accepted",
      answers: Object.fromEntries(
        Object.entries(answers).map(([key, value]) => [key, [value]]),
      ),
    });
  }
  async close() {
    this.generation += 1;
    for (const resolve of this.questions.values())
      resolve({ outcome: "cancelled" });
    this.questions.clear();
    this.text = null;
    const runtime = this.runtime;
    this.runtime = undefined;
    await runtime?.client.close();
  }
  private async request(method: string, value: unknown): Promise<unknown> {
    if (method === "_x.ai/ask_user_question") {
      const request = questionSchema.parse(value);
      if (request.sessionId !== this.threadId) return { outcome: "cancelled" };
      return new Promise((resolve) => {
        this.questions.set(request.toolCallId, resolve);
        this.events.question({
          id: request.toolCallId,
          questions: request.questions.map((question) => ({
            ...question,
            id: question.question,
          })),
        });
      });
    }
    if (method === "session/request_permission") {
      const request = permissionSchema.parse(value);
      const allowed =
        request.sessionId === this.threadId &&
        request.toolCall.rawInput?.tool_name?.startsWith("carrot__");
      const option = request.options.find(
        (option) => option.kind === (allowed ? "allow_once" : "reject_once"),
      );
      return {
        outcome: option
          ? { outcome: "selected", optionId: option.optionId }
          : { outcome: "cancelled" },
      };
    }
    throw new Error("지원하지 않는 Grok 요청입니다.");
  }
  private notification(method: string, value: unknown) {
    if (method !== "session/update") return;
    const parsed = updateSchema.safeParse(value);
    if (!parsed.success || parsed.data.sessionId !== this.threadId) return;
    const update = parsed.data.update;
    if (update.sessionUpdate === "agent_message_chunk") {
      const content = z
        .object({ type: z.literal("text"), text: z.string() })
        .safeParse(update.content);
      if (!content.success) return;
      this.text ??= { id: randomUUID(), value: "" };
      this.text.value += content.data.text;
      this.events.notification({
        kind: "text",
        id: this.text.id,
        delta: content.data.text,
      });
    } else if (
      (update.sessionUpdate === "tool_call" ||
        update.sessionUpdate === "tool_call_update") &&
      update.toolCallId
    ) {
      this.toolNotification(update);
    }
  }
  private toolNotification(update: z.infer<typeof updateSchema>["update"]) {
    this.finishText();
    const raw = z
      .object({
        tool_name: z.string().optional(),
        tool_input: z.unknown().optional(),
      })
      .passthrough()
      .safeParse(update.rawInput);
    this.events.notification({
      kind: "tool",
      id: update.toolCallId,
      name:
        (raw.success ? raw.data.tool_name : undefined)?.replace(
          /^carrot__/,
          "",
        ) ?? update.title,
      arguments: raw.success
        ? (raw.data.tool_input ?? update.rawInput)
        : update.rawInput,
      done: update.status === "completed" || update.status === "failed",
      failed: update.status === "failed",
      result: update.rawOutput,
    });
  }
  private finishText() {
    if (!this.text) return;
    this.events.notification({
      kind: "text",
      id: this.text.id,
      text: this.text.value,
      done: true,
    });
    this.text = null;
  }
}
