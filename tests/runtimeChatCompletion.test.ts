import { describe, expect, it, vi } from "vitest";

const { readChatCompletionResult } =
  require("../src/main/runtime/transport/chat-completion.cjs") as {
    readChatCompletionResult: (
      response: Response,
      options: Record<string, unknown>,
      requestSummary: Record<string, unknown>,
      requestStartedAt: number,
    ) => Promise<{ outputText: string }>;
  };

const { runWithApiKeyRetry } =
  require("../src/main/runtime/transport/api-key-retry.cjs") as {
    runWithApiKeyRetry: <T>(
      options: Record<string, unknown>,
      attempt: () => Promise<T>,
    ) => Promise<T>;
  };

function chatResponse(
  content: string,
  finishReason: string,
  extraMessage: Record<string, unknown> = {},
): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: finishReason,
          message: { content, ...extraMessage },
        },
      ],
    }),
    { status: 200 },
  );
}

describe("chat completion terminal reasons", () => {
  it.each([
    ["content_filter", "콘텐츠 정책"],
    ["content_filter: PROHIBITED_CONTENT", "사유: PROHIBITED_CONTENT"],
    ["content_filter: SAFETY", "사유: SAFETY"],
    [" content_filter :\n OTHER_REASON ", "사유: OTHER_REASON"],
    ["content_filter:", "콘텐츠 정책"],
  ])("stops at a provider block: %s", async (finishReason, message) => {
    // Gemini's blocked response omits message entirely, despite HTTP 200.
    const attempt = vi.fn(() =>
      readChatCompletionResult(
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: finishReason, index: 0 }],
          }),
          { status: 200 },
        ),
        {},
        {},
        Date.now(),
      ),
    );
    await expect(
      runWithApiKeyRetry(
        {
          modelProvider: "openai-api",
          apiKey: "test-key-one\ntest-key-two",
          apiKeyMaxAttempts: 3,
          apiRetryDelaySeconds: 0,
        },
        attempt,
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining(message),
      failureCategory: "model-refusal",
      nonRetriable: true,
    });
    expect(attempt).toHaveBeenCalledOnce();
  });

  it("rejects filtered content even when some output is present", async () => {
    await expect(
      readChatCompletionResult(
        chatResponse('{"items":[]}', "content_filter: PROHIBITED_CONTENT"),
        {},
        {},
        Date.now(),
      ),
    ).rejects.toMatchObject({
      failureCategory: "model-refusal",
      nonRetriable: true,
      message: expect.stringContaining("PROHIBITED_CONTENT"),
    });
  });

  it("keeps genuine empty output retriable and does not match similar names", async () => {
    for (const reason of ["stop", "content_filter_disabled"]) {
      const result = readChatCompletionResult(
        chatResponse("", reason),
        {},
        {},
        Date.now(),
      );
      await expect(result).rejects.toMatchObject({
        failureCategory: "empty-model-response",
      });
      await expect(result).rejects.not.toHaveProperty("nonRetriable");
    }
  });

  it("rejects a nonempty structured response cut off by max_tokens", async () => {
    const promise = readChatCompletionResult(
      chatResponse('{"items":[', "length"),
      {},
      { responseTokenLimitSource: "max-output-tokens" },
      Date.now(),
    );

    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining("최대 출력 토큰"),
      failureCategory: "empty-model-response",
      outputTruncated: true,
      failureGuidance: "increase-max-output-tokens",
    });
  });

  it("maps a context-capped truncated response to context guidance", async () => {
    await expect(
      readChatCompletionResult(
        chatResponse('{"items":[', "length"),
        {},
        { responseTokenLimitSource: "work-context-budget" },
        Date.now(),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("작품 정보 예산"),
      outputTruncated: true,
      failureGuidance: "increase-work-context-budget",
    });
  });

  it("maps a local context-capped response to context-length guidance", async () => {
    await expect(
      readChatCompletionResult(
        chatResponse('{"items":[', "length"),
        {},
        { responseTokenLimitSource: "context-length" },
        Date.now(),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("컨텍스트 길이"),
      outputTruncated: true,
      failureGuidance: "increase-context-length",
    });
  });

  it("does not blame settings when the internal structured cap was limiting", async () => {
    const promise = readChatCompletionResult(
      chatResponse('{"items":[', "length"),
      {},
      { responseTokenLimitSource: "structured-request-budget" },
      Date.now(),
    );

    await expect(promise).rejects.not.toHaveProperty("failureGuidance");
    await expect(promise).rejects.toMatchObject({
      message: expect.stringContaining("앱 내부 구조화 출력 한도"),
    });
  });

  it("accepts final content even when the provider also returns reasoning", async () => {
    await expect(
      readChatCompletionResult(
        chatResponse('{"items":[]}', "stop", {
          reasoning_content: "internal thoughts",
        }),
        {},
        {},
        Date.now(),
      ),
    ).resolves.toMatchObject({ outputText: '{"items":[]}' });
  });
});
