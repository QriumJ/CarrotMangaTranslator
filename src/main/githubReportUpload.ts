import { z } from "zod";
import {
  GitHubReportHttp,
  githubGistSchema,
  GitHubRequestNotSentError,
} from "./githubReportHttp";
import { digest } from "./errorReportSnapshot";
import type { GitHubCredentials } from "./githubReportCredentials";

export type GistUploadState = { id?: string; attempted?: boolean };
export type GistFiles = Record<string, { content: string }>;

/** Each acknowledged Gist is downloaded again before it can be linked in an issue. */
export async function uploadReportGist(options: {
  http: GitHubReportHttp;
  account: GitHubCredentials;
  marker: string;
  files: GistFiles;
  state: GistUploadState;
  save: () => Promise<void>;
}): Promise<string> {
  const { http, account, marker, files, state, save } = options;
  if (!state.id && state.attempted) {
    state.id = await recoverGist(http, account, marker);
    if (!state.id)
      throw new Error(
        "GitHub upload outcome is still unknown. Retry later to check the saved upload; no duplicate was sent.",
      );
    await save();
  }
  if (!state.id) {
    state.attempted = true;
    await save();
    try {
      const gist = githubGistSchema.parse(
        await http.api("/gists", account.accessToken, {
          description: marker,
          public: false,
          files,
        }),
      );
      if (gist.owner.id !== account.id)
        throw new Error("Unexpected Gist owner.");
      state.id = gist.id;
      await save();
    } catch (error) {
      await clearDefiniteRejection(error, state, save);
      throw error;
    }
  }
  await verifyGist(http, account, state.id, files);
  return `https://gist.github.com/${account.login}/${state.id}`;
}

async function recoverGist(
  http: GitHubReportHttp,
  account: GitHubCredentials,
  marker: string,
): Promise<string | undefined> {
  for (let page = 1; ; page++) {
    const gists = z
      .array(
        z.object({
          id: z.string().regex(/^[a-f0-9]+$/),
          description: z.string().nullable(),
        }),
      )
      .parse(
        await http.api(`/gists?per_page=100&page=${page}`, account.accessToken),
      );
    const found = gists.find((gist) => gist.description === marker);
    if (found) return found.id;
    if (gists.length < 100) return undefined;
  }
}

async function verifyGist(
  http: GitHubReportHttp,
  account: GitHubCredentials,
  id: string,
  files: GistFiles,
): Promise<void> {
  const gist = githubGistSchema.parse(
    await http.api(`/gists/${id}`, account.accessToken),
  );
  if (gist.owner.id !== account.id) throw new Error("Unexpected Gist owner.");
  for (const [name, expected] of Object.entries(files)) {
    const actual = gist.files[name];
    if (!actual)
      throw new Error(
        "GitHub omitted a report file. The issue was not submitted.",
      );
    const content =
      actual.truncated || actual.content === undefined
        ? await http.raw(actual.raw_url)
        : actual.content;
    if (
      Buffer.byteLength(content) !== Buffer.byteLength(expected.content) ||
      digest(content) !== digest(expected.content)
    )
      throw new Error(
        "Gist byte/hash verification failed. The issue was not submitted.",
      );
  }
}

export async function clearDefiniteRejection(
  error: unknown,
  state: { attempted?: boolean },
  save: () => Promise<void>,
): Promise<void> {
  // A network disconnect/5xx can follow a successful write. Never blindly POST it again.
  if (
    error instanceof GitHubRequestNotSentError ||
    (error instanceof Error && /^GitHub HTTP 4(?!08)\d\d\./.test(error.message))
  ) {
    state.attempted = false;
    await save();
  }
}
