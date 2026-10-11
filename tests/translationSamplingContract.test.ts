import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import {
  buildBaseTranslationOptions,
  resolveDefaultAppSettings,
} from "../src/main/appSettings";
import { buildRequestPageOptions } from "../src/main/pipeline/pageResultBuilder";
import { makeBlock, makePage } from "./helpers/automaticFontMatchingV2Fixtures";

const {
  buildChatRequestBody,
} = require("../src/main/runtime/transport/request-bodies.cjs");
const {
  buildSemanticStageRequestBody,
} = require("../src/main/runtime/transport/semantic-ocr-request-builders.cjs");
const {
  sendChatCompletion,
} = require("../src/main/runtime/transport/chat-completion.cjs");

function baseOptions(env: NodeJS.ProcessEnv = {}) {
  return buildBaseTranslationOptions({
    jobId: "sampling-contract",
    runDir: "fixture/run",
    paths: {
      dataRoot: "fixture",
      toolsDir: "fixture/tools",
      llamaServerPath: "fixture/tools/llama-server.exe",
    },
    settings: { ...resolveDefaultAppSettings({}), modelProvider: "gemma" },
    env,
  });
}

describe("translation settings to HTTP sampling contract", () => {
  let server: Server;
  let baseUrl: string;
  let received: Record<string, unknown>;

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      received = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No HTTP port");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it.each([
    { name: "defaults", env: {}, temperature: 0.1, topP: 0.95, topK: 64 },
    {
      name: "zero",
      env: {
        MANGA_TRANSLATOR_TEMPERATURE: "0",
        MANGA_TRANSLATOR_TOP_P: "0.7",
        MANGA_TRANSLATOR_TOP_K: "20",
      },
      temperature: 0,
      topP: 0.7,
      topK: 20,
    },
    {
      name: "custom above old clamp",
      env: {
        MANGA_TRANSLATOR_TEMPERATURE: "0.8",
        MANGA_TRANSLATOR_TOP_P: "0.99",
        MANGA_TRANSLATOR_TOP_K: "100",
      },
      temperature: 0.8,
      topP: 0.99,
      topK: 100,
    },
  ])(
    "preserves $name through fresh/refine/keep pages and retries",
    async ({ env, temperature, topP, topK }) => {
      const base = baseOptions(env);
      expect(base).toMatchObject({ temperature, topP, topK });
      for (const mode of ["fresh", "auto", "keep"] as const) {
        const page = {
          ...makePage(),
          blocks: mode === "fresh" ? [] : [makeBlock()],
        };
        for (const attempt of [1, 3]) {
          const options = buildRequestPageOptions({
            attempt,
            baseOptions: base,
            blockMode: mode === "keep" ? "keep" : "auto",
            context: {
              jobId: "sampling-contract",
              emit: () => {},
              progressTotal: 1,
              pageTotal: 1,
              ocrPipeline: "hayai",
            },
            maxAttempts: 5,
            ocrHintsByPageId: new Map(),
            page,
            pageIndex: 0,
            signal: new AbortController().signal,
            skipOcrPrepass: true,
          });
          expect(options).toMatchObject({ temperature, topP, topK });
          expect(Boolean(options.strictRefineMode)).toBe(mode !== "fresh");
          expect(Boolean(options.keepBlocksMode)).toBe(mode === "keep");
          for (const structured of [false, true]) {
            const body = structured
              ? buildSemanticStageRequestBody(options, [], {}, "translation", 2)
              : buildChatRequestBody(options, []);
            const summary: Record<string, unknown> = {};
            const response = await sendChatCompletion(
              { baseUrl },
              options,
              body,
              summary,
            );
            await response.text();
            expect(received).toMatchObject({
              temperature,
              top_p: topP,
              top_k: topK,
            });
            expect(summary.sentGeneration).toMatchObject({
              temperature: received.temperature,
              top_p: received.top_p,
              top_k: received.top_k,
              max_tokens: received.max_tokens,
            });
          }
        }
      }
      expect(base).toMatchObject({ temperature, topP, topK });
    },
  );

  it("records only final body fields, preserves zero, and replaces stale retry fields", async () => {
    const progress: Record<string, unknown>[] = [];
    const options = {
      modelProvider: "openai-api",
      apiModel: "test",
      onProgress: (event: Record<string, unknown>) => progress.push(event),
    };
    const summary: Record<string, unknown> = {};
    for (const body of [
      { temperature: 0.8, top_p: 0.7, top_k: 20, max_tokens: 100 },
      {
        temperature: 0,
        max_completion_tokens: 200,
        messages: ["private"],
        secret: "private",
        api_key: "private",
      },
    ]) {
      const response = await sendChatCompletion(
        { baseUrl },
        options,
        body,
        summary,
      );
      await response.text();
    }
    expect(summary.sentGeneration).toEqual({
      temperature: 0,
      max_completion_tokens: 200,
    });
    expect(progress.map((event) => event.sentGeneration)).toEqual([
      { temperature: 0.8, top_p: 0.7, top_k: 20, max_tokens: 100 },
      { temperature: 0, max_completion_tokens: 200 },
    ]);
  });

  it("keeps deterministic grouping separate from translation sampling", () => {
    const options = baseOptions({ MANGA_TRANSLATOR_TEMPERATURE: "0.8" });
    expect(
      buildSemanticStageRequestBody(options, [], {}, "grouping", 2).temperature,
    ).toBe(0);
    expect(
      buildSemanticStageRequestBody(options, [], {}, "translation", 2)
        .temperature,
    ).toBe(0.8);
  });

  it("retains attempted wire values while preserving cancellation identity", async () => {
    const options = {
      ...baseOptions({ MANGA_TRANSLATOR_TEMPERATURE: "0" }),
      abortSignal: AbortSignal.abort(),
    };
    const body = buildSemanticStageRequestBody(
      options,
      [],
      {},
      "translation",
      2,
    );
    const summary: Record<string, unknown> = {};
    await expect(
      sendChatCompletion({ baseUrl }, options, body, summary),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(summary).toMatchObject({
      sentGeneration: {
        temperature: 0,
        top_p: 0.95,
        top_k: 64,
        max_tokens: body.max_tokens,
      },
    });
  });
});
