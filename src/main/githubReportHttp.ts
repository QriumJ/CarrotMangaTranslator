import { z } from "zod";

export type GitHubReportFetch = typeof fetch;

export class GitHubRequestNotSentError extends Error {}

const connectionFailureSchema = z.object({
  cause: z.object({
    code: z.enum([
      "ENOTFOUND",
      "EAI_AGAIN",
      "ECONNREFUSED",
      "ENETUNREACH",
      "EHOSTUNREACH",
      "UND_ERR_CONNECT_TIMEOUT",
    ]),
  }),
});

/** Fixed GitHub origins only. Never include response bodies or tokens in errors. */
export class GitHubReportHttp {
  constructor(private readonly request: GitHubReportFetch = fetch) {}

  async oauth(values: Record<string, string>): Promise<unknown> {
    const endpoint =
      "device_code" in values || "refresh_token" in values
        ? "oauth/access_token"
        : "device/code";
    return this.json(`https://github.com/login/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values).toString(),
    });
  }

  async api(path: string, token: string, body?: unknown): Promise<unknown> {
    if (!/^\/[a-zA-Z0-9_/?=&.%-]+$/.test(path))
      throw new Error("Invalid GitHub API path.");
    return this.json(`https://api.github.com${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async raw(url: string): Promise<string> {
    const parsed = new URL(url);
    if (
      parsed.origin !== "https://gist.githubusercontent.com" ||
      parsed.username ||
      parsed.password
    )
      throw new Error("Unexpected Gist download location.");
    return (await this.send(url, {})).text();
  }

  private async json(url: string, init: RequestInit): Promise<unknown> {
    return (await this.send(url, init)).json();
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await this.request(url, {
        ...init,
        headers: {
          Accept: "application/json",
          "User-Agent": "CarrotMangaTranslator",
          ...init.headers,
        },
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      // Keep the transport cause in local diagnostics, never in user-facing feedback.
      const Failure = connectionFailureSchema.safeParse(error).success
        ? GitHubRequestNotSentError
        : Error;
      throw new Failure(
        "GitHub connection failed. Retry to resume the saved report.",
        { cause: error },
      );
    }
    if (!response.ok)
      throw new Error(
        `GitHub HTTP ${response.status}. Retry after checking your connection and authorization.`,
      );
    return response;
  }
}

export const githubIdentitySchema = z.object({
  id: z.number().int(),
  login: z.string().regex(/^[\w-]+$/),
});
export const githubGistSchema = z.object({
  id: z.string().regex(/^[a-f0-9]+$/),
  description: z.string().nullable(),
  owner: githubIdentitySchema,
  files: z.record(
    z.string(),
    z.object({
      content: z.string().optional(),
      truncated: z.boolean().optional(),
      raw_url: z.string().url(),
    }),
  ),
});
