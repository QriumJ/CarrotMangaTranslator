import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
  },
}));

import {
  getPreviousLogPath,
  resetAppLog,
  serializeLogDetail,
  writeLog,
  getLogDirectory,
  logInfo,
  logWarn,
  logError,
} from "../src/main/logger";

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.MANGA_TRANSLATOR_LOG_PATH;
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("logger serialization", () => {
  it("preserves heterogeneous SDK diagnostics and safely bounds pathological cycles", () => {
    const array: unknown[] = [];
    array.push(array);
    const error = Object.assign(new Error("cycle"), {
      name: "CustomError",
      stack: undefined,
      cause: undefined,
      token: "private",
    });
    error.cause = error as never;
    let deep: unknown = { bottom: true };
    for (let i = 0; i < 70; i++) deep = { child: deep };
    let causes = new Error("bottom");
    for (let i = 0; i < 70; i++) causes = new Error("chain", { cause: causes });
    const result = JSON.parse(
      serializeLogDetail({
        array,
        error,
        deep,
        causes,
        dates: [new Date(0), new Date(NaN)],
        url: new URL("https://example.test"),
        map: new Map([["code", { value: 12n }]]),
        set: new Set(["a", "b"]),
        values: [
          undefined,
          null,
          false,
          1,
          Symbol("x"),
          function nativeDiagnostic() {},
        ],
      }),
    );
    expect(result.map.entries).toEqual([["code", { value: "12n" }]]);
    expect(result.set.values).toEqual(["a", "b"]);
    expect(result.error.cause).toBe("[Circular Error]");
    expect(result.error.token).toBe("<redacted>");
    expect(result.array).toEqual([["[Circular]"]]);
    expect(result.dates).toEqual(["1970-01-01T00:00:00.000Z", "Invalid Date"]);
    expect(JSON.stringify(result.causes)).toContain("diagnosticDepthLimit");
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("bad metadata");
        },
      },
    );
    expect(serializeLogDetail(proxy)).toContain("serializationError");
  });
  it("writes every severity through the same complete diagnostic serializer", () => {
    const dir = mkdtempSync(join(tmpdir(), "logger-severity-"));
    tempDirs.push(dir);
    const file = join(dir, "app.log");
    process.env.MANGA_TRANSLATOR_LOG_PATH = file;
    expect(getLogDirectory()).toBe(dir);
    logInfo("info", new Set(["FIRST", "LAST"]));
    logWarn("warn", new Map([["reason", "FULL_REASON"]]));
    logError("error", "line1\nline2");
    const saved = readFileSync(file, "utf8");
    expect(saved).toContain("FIRST");
    expect(saved).toContain("FULL_REASON");
    expect(saved).toContain("line1\\nline2");
  });
  it("keeps the start of an oversized previous session after restarting", () => {
    const dir = mkdtempSync(join(tmpdir(), "manga-log-complete-"));
    tempDirs.push(dir);
    const logPath = join(dir, "app.log");
    const original = `[ERROR] ORIGINAL_FAILURE\n${"x".repeat(5 * 1024 * 1024)}\nLAST_RECORD`;
    writeFileSync(logPath, original);
    process.env.MANGA_TRANSLATOR_LOG_PATH = logPath;
    resetAppLog();
    expect(readFileSync(getPreviousLogPath(logPath), "utf8")).toBe(original);
  });
  it("preserves nested error metadata for AI-friendly diagnostics", () => {
    const inner = new Error("inner failure");
    const outer = new Error("outer failure") as Error & {
      cause?: unknown;
      code?: string;
      meta?: unknown;
    };
    outer.cause = inner;
    outer.code = "E_OUTER";
    outer.meta = { jobId: "job-123", page: "1.webp" };

    const detail = JSON.parse(serializeLogDetail({ error: outer })) as {
      error: {
        name: string;
        message: string;
        code: string;
        cause: { message: string };
        meta: { page: string };
      };
    };

    expect(detail.error.name).toBe("Error");
    expect(detail.error.message).toBe("outer failure");
    expect(detail.error.code).toBe("E_OUTER");
    expect(detail.error.cause.message).toBe("inner failure");
    expect(detail.error.meta.page).toBe("1.webp");
  });

  it("handles circular objects without throwing", () => {
    const detail: { self?: unknown; nested?: unknown } = {};
    detail.self = detail;
    detail.nested = { parent: detail };

    const serialized = JSON.parse(serializeLogDetail(detail)) as {
      self: string;
      nested: { parent: string };
    };

    expect(serialized.self).toBe("[Circular]");
    expect(serialized.nested.parent).toBe("[Circular]");
  });

  it("redacts credential keys, URL secrets, user paths, and buffer previews", () => {
    const serialized = serializeLogDetail({
      apiKey: "sk-private-secret-value",
      nested: {
        Authorization: "Bearer private-token-value",
        url: "https://example.test/run?token=private-query&ok=1",
        sourcePath: "C:\\Users\\private-user\\chapter\\1.png",
      },
      payload: Buffer.from("Bearer buffer-secret-value"),
    });

    expect(serialized).not.toContain("private-secret-value");
    expect(serialized).not.toContain("private-token-value");
    expect(serialized).not.toContain("private-query");
    expect(serialized).not.toContain("private-user");
    expect(serialized).not.toContain("buffer-secret-value");
    expect(serialized).toContain("<redacted>");
    expect(serialized).toContain("https://example.test/run");

    expect(
      serializeLogDetail(
        new Map<string, string>([["custom-auth-token", "map-secret"]]),
      ),
    ).not.toContain("map-secret");

    const throwingGetter = Object.defineProperty({}, "sourceText", {
      enumerable: true,
      get() {
        throw new Error("serialization failed");
      },
    });
    expect(serializeLogDetail(throwingGetter)).toBe(
      '{"sourceText":"<redacted>"}',
    );

    const throwingNonSensitiveGetter = Object.defineProperty(
      { rootCause: "KEEP_ROOT_CAUSE" },
      "displayValue",
      {
        enumerable: true,
        get() {
          throw new Error("serialization failed");
        },
      },
    );
    const serializationFailure = serializeLogDetail(throwingNonSensitiveGetter);
    expect(serializationFailure).toContain("displayValue");
    expect(serializationFailure).toContain("KEEP_ROOT_CAUSE");
    expect(serializationFailure).toContain("serializationError");
  });

  it("rotates the current app log before starting a new session", () => {
    const dir = mkdtempSync(join(tmpdir(), "manga-logger-"));
    tempDirs.push(dir);
    const logPath = join(dir, "logs", "app.log");
    mkdirSync(join(dir, "logs"), { recursive: true });
    writeFileSync(logPath, "previous crash details\n", "utf8");
    process.env.MANGA_TRANSLATOR_LOG_PATH = logPath;

    resetAppLog();

    expect(readFileSync(getPreviousLogPath(logPath), "utf8")).toBe(
      "previous crash details\n",
    );
    expect(readFileSync(logPath, "utf8")).toBe("");
  });

  it("redacts renderer-style message strings at the final log boundary", () => {
    const dir = mkdtempSync(join(tmpdir(), "manga-logger-redaction-"));
    tempDirs.push(dir);
    const logPath = join(dir, "logs", "app.log");
    process.env.MANGA_TRANSLATOR_LOG_PATH = logPath;
    resetAppLog();

    writeLog(
      "error",
      "renderer: Authorization: Bearer renderer-secret-token at /Volumes/Private Manga/001.webp?api_key=query-secret",
    );

    const log = readFileSync(logPath, "utf8");
    expect(log).not.toContain("renderer-secret-token");
    expect(log).not.toContain("Private Manga");
    expect(log).not.toContain("query-secret");
    expect(log).toContain("renderer:");
    expect(log).toContain("<local-path>");
  });

  it("does not throw when the log location cannot be created", () => {
    const dir = mkdtempSync(join(tmpdir(), "manga-logger-failure-"));
    tempDirs.push(dir);
    const blockedParent = join(dir, "not-a-directory");
    writeFileSync(blockedParent, "file", "utf8");
    process.env.MANGA_TRANSLATOR_LOG_PATH = join(blockedParent, "app.log");

    expect(() => resetAppLog()).not.toThrow();
  });
});
