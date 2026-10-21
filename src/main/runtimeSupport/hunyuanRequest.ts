import type { HunyuanServer } from "./hunyuanServer";

const PROMPT =
  "提取图片中的所有文字，按照阅读顺序输出原文，不要翻译，不要解释。";

export async function recognizeHunyuanCrop(
  server: HunyuanServer,
  image: string,
  signal: AbortSignal,
): Promise<string> {
  for (const maxTokens of [384, 1024]) {
    server.assertAlive();
    const response = await fetch(`${server.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: server.headers,
      signal,
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: image } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
        temperature: 0,
        top_k: 1,
        top_p: 1,
        min_p: 0,
        repeat_penalty: 1.08,
        repeat_last_n: 4096,
        seed: 123,
        max_tokens: maxTokens,
        cache_prompt: false,
      }),
    });
    server.assertAlive();
    const body = await response.text();
    if (!response.ok) {
      if (/context|too (?:large|long)|exceed.*tokens/i.test(body))
        throw new RangeError(
          "HunyuanOCR 입력이 context 4,096을 초과했습니다. 큰 선택 영역을 나누어 다시 실행하세요.",
        );
      throw new Error(
        `HunyuanOCR HTTP ${response.status}: ${body.slice(0, 2000)}`,
      );
    }
    const parsed: unknown = JSON.parse(body);
    const completion = readCompletion(parsed);
    if (completion.finish_reason === "length") continue;
    if (completion.finish_reason !== "stop")
      throw new Error(
        `HunyuanOCR incomplete output: ${completion.finish_reason}`,
      );
    return completion.text.trim();
  }
  throw new Error(
    "HunyuanOCR 출력이 1,024 tokens에서도 잘렸습니다. 영역을 나누어 다시 실행하세요.",
  );
}

function readCompletion(value: unknown): {
  text: string;
  finish_reason: string;
} {
  const result = value as {
    choices?: Array<{
      message?: { content?: unknown };
      finish_reason?: unknown;
    }>;
  } | null;
  const choice = result?.choices?.[0];
  if (
    typeof choice?.message?.content !== "string" ||
    typeof choice.finish_reason !== "string"
  )
    throw new Error("HunyuanOCR returned an invalid completion.");
  return { text: choice.message.content, finish_reason: choice.finish_reason };
}
