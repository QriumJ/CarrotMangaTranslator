import { afterEach, describe, expect, it, vi } from "vitest";
import { shell } from "electron";
import { GitHubReportService } from "../src/main/githubReportService";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitHubReportAuth } from "../src/main/githubReportAuth";
import {
  GitHubReportCredentials,
  type GitHubCredentials,
} from "../src/main/githubReportCredentials";
import { GitHubReportHttp } from "../src/main/githubReportHttp";
import {
  captureReportSnapshot,
  loadReportSnapshot,
  readReportPart,
  reportSnapshotDirectory,
} from "../src/main/errorReportSnapshot";
import { submitGitHubReport } from "../src/main/githubReportSubmission";
import { uploadReportGist } from "../src/main/githubReportUpload";
import type { ErrorReportBuildEnvironment } from "../src/main/errorReportEnvironment";
import type { AppPaths } from "../src/main/appPaths";
import type { SubmitGitHubReport } from "../src/shared/githubReport";

vi.mock("electron", () => ({
  app: {},
  shell: { openExternal: vi.fn(async () => {}) },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) =>
      Buffer.from(text.split("").reverse().join("")),
    decryptString: (bytes: Buffer) =>
      bytes.toString().split("").reverse().join(""),
  },
}));
const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
const identity = { id: 42, login: "reporter" };
const account: GitHubCredentials = {
  ...identity,
  clientId: "client",
  accessToken: "test-token",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "carrot-github-report-"));
  directories.push(directory);
  return directory;
}

function environment(root: string): ErrorReportBuildEnvironment {
  const paths: AppPaths = {
    isPackaged: false,
    repoRoot: root,
    executableDir: root,
    resourcesDir: root,
    dataRoot: root,
    settingsPath: join(root, "settings.json"),
    libraryDir: join(root, "library"),
    fontsDir: join(root, "fonts"),
    logsDir: root,
    logFile: join(root, "app.log"),
    runtimeDir: root,
    toolsDir: root,
    ocrRuntimeDir: root,
    llamaRuntimeDir: root,
    llamaServerPath: join(root, "llama"),
  };
  return {
    appPaths: paths,
    appVersion: "3.7.3",
    locale: "ko",
    isPackaged: false,
    platform: "win32",
    arch: "x64",
    osRelease: "test",
    electronVersion: "test",
    nodeVersion: "test",
    settings: null,
    gpu: null,
    currentLogPath: paths.logFile,
    previousLogPath: join(root, "previous.log"),
    executionDiagnostics: {
      budgetSource: "structured-request-budget",
      responseMaxTokens: 5120,
    },
  };
}

function fakeGitHub() {
  const gists = new Map<
    string,
    {
      id: string;
      description: string;
      owner: typeof identity;
      files: Record<string, { content: string; raw_url: string }>;
    }
  >();
  const issues: { number: number; body: string }[] = [];
  let failIssue = false;
  let corrupt = false;
  let loseGistReply = false;
  let loseIssueReply = false;
  const request = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.pathname === "/gists" && init?.method === "POST") {
      const id = (gists.size + 10).toString(16);
      const files = Object.fromEntries(
        Object.entries(body.files as Record<string, { content: string }>).map(
          ([name, file]) => [
            name,
            {
              ...file,
              raw_url: `https://gist.githubusercontent.com/reporter/${id}/raw/${name}`,
            },
          ],
        ),
      );
      const gist = {
        id,
        description: body.description,
        owner: identity,
        files,
      };
      gists.set(id, gist);
      if (loseGistReply) {
        loseGistReply = false;
        throw new Error("connection lost after commit");
      }
      return json(gist);
    }
    if (url.pathname === "/gists") return json([...gists.values()]);
    if (url.pathname.startsWith("/gists/")) {
      const gist = structuredClone(
        gists.get(required(url.pathname.split("/").at(-1))),
      );
      if (corrupt && gist)
        required(Object.values(gist.files)[0]).content += "CORRUPTED";
      return json(gist);
    }
    if (url.pathname.endsWith("/issues") && init?.method === "POST") {
      if (failIssue) {
        failIssue = false;
        return json({}, 429);
      }
      const issue = { number: issues.length + 200, body: body.body };
      issues.push(issue);
      if (loseIssueReply) {
        loseIssueReply = false;
        throw new Error("connection lost after issue commit");
      }
      return json(issue);
    }
    if (url.pathname.endsWith("/issues")) return json(issues);
    throw new Error("Unexpected request in test");
  });
  return {
    request,
    http: new GitHubReportHttp(request),
    gists,
    issues,
    failIssue: () => {
      failIssue = true;
    },
    corrupt: () => {
      corrupt = true;
    },
    loseGistReply: () => {
      loseGistReply = true;
    },
    loseIssueReply: () => {
      loseIssueReply = true;
    },
  };
}

async function fixture(log = "FIRST\nLAST\n") {
  const root = await temporaryDirectory();
  const env = environment(root);
  await writeFile(env.currentLogPath, log);
  const snapshot = await captureReportSnapshot(
    { source: "job-failure", message: "full-error" },
    env,
  );
  const request: SubmitGitHubReport = {
    reportId: snapshot.id,
    title: "Report",
    description: "Details",
    includeLogs: true,
    includeSystem: true,
  };
  return { root, env, snapshot, request };
}

describe("complete GitHub reports", () => {
  it("retries a request that failed before connecting without leaving an unknown upload", async () => {
    const { root, request } = await fixture();
    const github = fakeGitHub();
    github.request.mockRejectedValueOnce(
      new TypeError("DNS failure", { cause: { code: "ENOTFOUND" } }),
    );
    await expect(
      submitGitHubReport(root, request, account, github.http),
    ).rejects.toThrow("connection");
    expect(github.gists.size).toBe(0);
    await submitGitHubReport(root, request, account, github.http);
    expect(github.gists.size).toBe(1);
    expect(github.issues).toHaveLength(1);
  });
  it("opens only the completed issue in the default browser and blocks simultaneous submissions", async () => {
    const { root, request } = await fixture();
    const github = fakeGitHub();
    vi.stubGlobal("fetch", github.request);
    await new GitHubReportCredentials(root).save(account);
    const service = new GitHubReportService(root, "client");
    expect(await service.account("status")).toMatchObject({
      login: "reporter",
    });
    vi.mocked(shell.openExternal).mockRejectedValueOnce(
      new Error("no browser"),
    );
    const pending = service.submit(request);
    expect(() => service.submit(request)).toThrow("already");
    expect(() => service.account("disconnect")).toThrow("Wait");
    expect(await pending).toEqual({
      issueUrl: "https://github.com/ucx0204/CarrotMangaTranslator/issues/200",
      opened: false,
    });
    expect(await service.submit(request)).toMatchObject({ opened: true });
    expect(shell.openExternal).toHaveBeenCalledWith(
      "https://github.com/ucx0204/CarrotMangaTranslator/issues/200",
    );
    expect(github.issues).toHaveLength(1);
  });
  it("round-trips >4MiB across multiple Gists without losing either issue's cause or Unicode", async () => {
    const before = "INFO ".repeat(1200) + "가😀".repeat(350_000);
    const log = `ISSUE160_HTTP400\n${before}\nMIDDLE_RAW_PROVIDER_CAUSE\n${before}\nISSUE161_budgetSource=structured-request-budget responseMaxTokens=5120\n`;
    const { root, env, snapshot, request } = await fixture(log);
    await writeFile(
      env.currentLogPath,
      "NEW_SESSION_MUST_NOT_REPLACE_SNAPSHOT",
    );
    const github = fakeGitHub();
    const url = await submitGitHubReport(root, request, account, github.http);
    expect(url).toContain("/issues/200");
    expect(github.gists.size).toBeGreaterThan(1);
    const files = [...github.gists.values()].flatMap((gist) =>
      Object.entries(gist.files),
    );
    const restored = files
      .filter(([name]) => name.startsWith("current-"))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, file]) => file.content)
      .join("");
    expect(restored).toBe(log);
    expect(restored).not.toContain("�");
    expect(required(github.issues[0]).body).toContain("Files:");
    expect(await loadReportSnapshot(root, snapshot.id)).toEqual(snapshot);
    await submitGitHubReport(root, request, account, github.http);
    expect(github.issues).toHaveLength(1);
  });

  it("redacts secrets, keeps unlimited context, and honors inclusion choices", async () => {
    const { root, env } = await fixture();
    await writeFile(
      env.currentLogPath,
      'first\n{"apiKey":"sk-abcdefghijklmnop","status":400}\nlast\n',
    );
    await writeFile(env.previousLogPath, "previous evidence\n");
    const snapshot = await captureReportSnapshot(
      { source: "manual", message: "L".repeat(90_000) + "CONTEXT_END" },
      env,
    );
    const github = fakeGitHub();
    await submitGitHubReport(
      root,
      {
        reportId: snapshot.id,
        title: "Report",
        description: "token=secret",
        includeLogs: false,
        includeSystem: false,
      },
      account,
      github.http,
    );
    const names = [...github.gists.values()].flatMap((gist) =>
      Object.keys(gist.files),
    );
    expect(names.some((name) => /^(current|previous|system)-/.test(name))).toBe(
      false,
    );
    expect(JSON.stringify([...github.gists.values()])).toContain("CONTEXT_END");
    const log = await readReportPart(
      reportSnapshotDirectory(root, snapshot.id),
      required(snapshot.parts.find((part) => part.kind === "current")),
    );
    expect(log).not.toContain("sk-abcdefghijklmnop");
    expect(log).toContain('"status":400');
    expect(snapshot.missingLogs).toEqual([]);
  });

  it("resumes verified uploads after a rejected issue request", async () => {
    const { root, request } = await fixture();
    const github = fakeGitHub();
    github.failIssue();
    await expect(
      submitGitHubReport(root, request, account, github.http),
    ).rejects.toThrow("429");
    expect(github.issues).toHaveLength(0);
    await submitGitHubReport(root, request, account, github.http);
    expect(github.gists.size).toBe(1);
    expect(github.issues).toHaveLength(1);
    await expect(
      submitGitHubReport(root, request, { ...account, id: 43 }, github.http),
    ).rejects.toThrow("account");
    await expect(
      submitGitHubReport(
        root,
        { ...request, includeLogs: false },
        account,
        github.http,
      ),
    ).rejects.toThrow("original fields");
  });

  it.each(["gist", "issue"])(
    "recovers an acknowledged-by-server but lost %s reply without duplicates",
    async (kind) => {
      const { root, request } = await fixture();
      const github = fakeGitHub();
      if (kind === "gist") github.loseGistReply();
      else github.loseIssueReply();
      await expect(
        submitGitHubReport(root, request, account, github.http),
      ).rejects.toThrow("connection");
      await submitGitHubReport(root, request, account, github.http);
      expect(github.gists.size).toBe(1);
      expect(github.issues).toHaveLength(1);
    },
  );

  it("never creates an issue if GitHub returns truncated or corrupted evidence", async () => {
    const { root, request } = await fixture();
    const github = fakeGitHub();
    github.corrupt();
    await expect(
      submitGitHubReport(root, request, account, github.http),
    ).rejects.toThrow("verification failed");
    expect(github.issues).toHaveLength(0);
  });

  it("refuses damaged local snapshots and non-file logs instead of silently skipping them", async () => {
    const { root, snapshot, request } = await fixture();
    await writeFile(
      join(
        reportSnapshotDirectory(root, snapshot.id),
        required(snapshot.parts[0]).name,
      ),
      "damage",
    );
    await expect(
      submitGitHubReport(root, request, account, fakeGitHub().http),
    ).rejects.toThrow("integrity");
    const env = environment(await temporaryDirectory());
    await mkdir(env.currentLogPath);
    await expect(
      captureReportSnapshot({ source: "manual" }, env),
    ).rejects.toThrow();
    expect(() => reportSnapshotDirectory(root, "../escape")).toThrow();
  });

  it("verifies raw content if the Gist response is truncated without forwarding the token", async () => {
    const request = vi.fn<typeof fetch>(async (url) =>
      String(url).includes("api.github.com")
        ? json({
            id: "ab",
            description: "test",
            owner: identity,
            files: {
              "log.txt": {
                truncated: true,
                raw_url:
                  "https://gist.githubusercontent.com/reporter/ab/raw/log.txt",
              },
            },
          })
        : new Response("FULL"),
    );
    await uploadReportGist({
      http: new GitHubReportHttp(request),
      account,
      marker: "test",
      state: { id: "ab" },
      save: async () => {},
      files: { "log.txt": { content: "FULL" } },
    });
    expect(
      required(required(request.mock.calls[1])[1]).headers,
    ).not.toHaveProperty("Authorization");
    await expect(
      new GitHubReportHttp(request).raw("https://attacker.example/log"),
    ).rejects.toThrow("Unexpected");
  });
});

describe("GitHub device authorization", () => {
  it("does not contact GitHub when unconfigured and never accepts missing scopes", async () => {
    const store = { load: async () => null, save: vi.fn(async () => {}) };
    const request = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith("device/code")
        ? json({
            device_code: "private",
            user_code: "USER-CODE",
            verification_uri: "https://github.com/login/device",
            expires_in: 900,
            interval: 1,
          })
        : json({ access_token: "private-token", scope: "gist" }),
    );
    let now = 0;
    const missing = new GitHubReportAuth(
      "",
      store,
      new GitHubReportHttp(request),
      async () => {},
    );
    expect(await missing.action("status")).toEqual({ configured: false });
    await expect(missing.credentials()).rejects.toThrow("Client ID");
    expect(request).not.toHaveBeenCalled();
    const auth = new GitHubReportAuth(
      "client",
      store,
      new GitHubReportHttp(request),
      async () => {},
      () => now,
    );
    await auth.action("start");
    now = 1000;
    await expect(auth.action("poll")).rejects.toThrow("requires Gist");
    expect(store.save).toHaveBeenCalledWith(null);
  });

  it.each(["access_denied", "expired"])(
    "clears a %s sign-in without saving credentials",
    async (failure) => {
      let now = 0;
      const save = vi.fn(async () => {});
      const request = vi.fn<typeof fetch>(async (url) =>
        String(url).endsWith("device/code")
          ? json({
              device_code: "private",
              user_code: "USER-CODE",
              verification_uri: "https://github.com/login/device",
              expires_in: 2,
              interval: 1,
            })
          : json({ error: failure }),
      );
      const auth = new GitHubReportAuth(
        "client",
        { load: async () => null, save },
        new GitHubReportHttp(request),
        async () => {},
        () => now,
      );
      await auth.action("start");
      now = failure === "expired" ? 3000 : 1000;
      await expect(auth.action("poll")).rejects.toThrow(/denied|expired/);
      expect(await auth.action("status")).toMatchObject({
        userCode: undefined,
      });
      expect(save).toHaveBeenCalledWith(null);
      await auth.action("poll");
    },
  );

  it.each([undefined, "revoked-refresh"])(
    "clears an expired session with unusable refresh credentials",
    async (refreshToken) => {
      const save = vi.fn(async () => {});
      const auth = new GitHubReportAuth(
        "client",
        {
          load: async () => ({ ...account, expiresAt: 1, refreshToken }),
          save,
        },
        new GitHubReportHttp(async () => json({ error: "bad_refresh_token" })),
        async () => {},
        () => 10000,
      );
      await expect(auth.credentials()).rejects.toThrow("session expired");
      expect(save).toHaveBeenCalledWith(null);
    },
  );

  it("honors pending/slow_down intervals, persists the account, refreshes it, and disconnects", async () => {
    let now = 0;
    let saved: GitHubCredentials | null = null;
    const responses = [
      {
        device_code: "private-device",
        user_code: "ABCD-EFGH",
        verification_uri: "https://github.com/login/device",
        expires_in: 900,
        interval: 5,
      },
      { error: "authorization_pending" },
      { error: "slow_down" },
      {
        access_token: "secret-one",
        refresh_token: "refresh-one",
        scope: "gist,public_repo",
        expires_in: 120,
      },
      identity,
      {
        access_token: "secret-two",
        refresh_token: "refresh-two",
        expires_in: 120,
      },
      identity,
    ];
    const request = vi.fn<typeof fetch>(async () => json(responses.shift()));
    const open = vi.fn(async () => {});
    const auth = new GitHubReportAuth(
      "client",
      {
        load: async () => saved,
        save: async (value) => {
          saved = value;
        },
      },
      new GitHubReportHttp(request),
      open,
      () => now,
    );
    expect(await auth.action("start")).toEqual({
      configured: true,
      login: undefined,
      userCode: "ABCD-EFGH",
      expiresAt: 900_000,
    });
    expect(open).toHaveBeenCalledWith("https://github.com/login/device");
    expect(await auth.action("reopen")).toMatchObject({
      userCode: "ABCD-EFGH",
    });
    expect(open).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenLastCalledWith("https://github.com/login/device");
    await auth.action("poll");
    expect(request).toHaveBeenCalledTimes(1);
    now = 5000;
    await auth.action("poll");
    now = 10_000;
    await auth.action("poll");
    now = 15_000;
    await auth.action("poll");
    expect(request).toHaveBeenCalledTimes(3);
    now = 20_000;
    expect((await auth.action("poll")).login).toBe("reporter");
    await auth.action("reopen");
    expect(open).toHaveBeenCalledTimes(2);
    expect((await auth.credentials()).accessToken).toBe("secret-one");
    now = 90_000;
    expect((await auth.credentials()).accessToken).toBe("secret-two");
    expect(
      String(required(required(request.mock.calls[5])[1]).body),
    ).not.toContain("client_secret");
    expect(await auth.action("disconnect")).not.toHaveProperty(
      "login",
      "reporter",
    );
    await expect(auth.credentials()).rejects.toThrow("Sign in");
  });

  it("does not store credentials in plaintext and refuses unavailable OS encryption", async () => {
    const root = await temporaryDirectory();
    const codec = {
      available: () => true,
      encrypt: (text: string) => Buffer.from(text.split("").reverse().join("")),
      decrypt: (value: Buffer) => value.toString().split("").reverse().join(""),
    };
    const store = new GitHubReportCredentials(root, codec);
    expect(await store.load()).toBeNull();
    await store.save(account);
    expect(await store.load()).toEqual(account);
    expect(
      await readFile(
        join(root, "github-report-private", "authorization.enc"),
        "utf8",
      ),
    ).not.toContain("test-token");
    codec.available = () => false;
    await expect(store.load()).rejects.toThrow("encryption");
    await expect(store.save(account)).rejects.toThrow("encryption");
  });
});

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected fixture value");
  return value;
}
