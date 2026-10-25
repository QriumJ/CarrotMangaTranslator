import { beforeEach, describe, expect, it, vi } from "vitest";
import { app, clipboard, shell } from "electron";
import type { AppPaths } from "../src/main/appPaths";
import type {
  ErrorReportIpcContext,
  ErrorReportIpcRuntime,
} from "../src/main/ipc/errorReportIpc";
import type { LogsIpcRuntime } from "../src/main/ipc/logsIpc";
import type { ErrorReportDraft } from "../src/shared/errorReportTypes";

type IpcEvent = {
  sender: { id: number };
  senderFrame?: { url: string };
};
type IpcHandler = (event: IpcEvent, ...args: unknown[]) => Promise<unknown>;

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, IpcHandler>();
  return {
    handlers,
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler);
    }),
  };
});

vi.mock("electron", () => ({
  app: {
    getLocale: () => "en",
    getVersion: () => "0.0.0-test",
    isPackaged: false,
    quit: vi.fn(),
    relaunch: vi.fn(),
  },
  clipboard: { writeText: vi.fn() },
  ipcMain: { handle: electronMock.handle },
  shell: {
    openExternal: vi.fn(async () => undefined),
    showItemInFolder: vi.fn(async () => undefined),
  },
}));

import {
  buildGitHubIssueUrl,
  openErrorReportIssue,
  registerErrorReportIpc,
} from "../src/main/ipc/errorReportIpc";
import { registerLogsIpc } from "../src/main/ipc/logsIpc";

const PREPARED_DRAFT: ErrorReportDraft = {
  defaultTitle: "[Bug] Test",
  errorMarkdown: "error",
  systemMarkdown: "system",
  logsMarkdown: "logs",
  redactionCount: 0,
  truncated: false,
};

beforeEach(() => {
  electronMock.handlers.clear();
  vi.clearAllMocks();
});

describe("error report IPC", () => {
  it("uses Electron clipboard/browser/restart ports for legacy callers", async () => {
    vi.useFakeTimers();
    try {
      registerErrorReportIpc(makeContext());
      const event = eventFor(1, "http://127.0.0.1:5173/");
      await requiredHandler("error-report:copy")(event, "diagnostic");
      expect(clipboard.writeText).toHaveBeenCalledWith("diagnostic");
      await requiredHandler("error-report:open-issue")(event, {
        title: "failure",
        body: "details",
      });
      expect(shell.openExternal).toHaveBeenCalled();
      await requiredHandler("error-report:restart-app")(event);
      expect(app.relaunch).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(100);
      expect(app.quit).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the URL budget for both ends of evidence and copies the expanded report", async () => {
    const runtime = makeErrorReportRuntime();
    const body = `ROOT_CAUSE ${"한글😀".repeat(3000)} END_OF_EVIDENCE`;
    await openErrorReportIssue({ title: "Long report", body }, runtime);
    const url = new URL(
      String(vi.mocked(runtime.openExternal).mock.calls[0][0]),
    );
    expect(url.toString().length).toBeLessThanOrEqual(7000);
    expect(url.searchParams.get("body")).toContain("ROOT_CAUSE");
    expect(url.searchParams.get("body")).toContain("END_OF_EVIDENCE");
    expect(url.searchParams.get("body")).toContain("middle omitted");
    expect(url.toString().length).toBeGreaterThan(6800);
    expect(runtime.writeClipboard).toHaveBeenCalledWith(body);
  });

  it("reuses small sections' URL space and retains a fifth diagnostic section", async () => {
    const runtime = makeErrorReportRuntime();
    const body = [
      "## Description\nshort",
      "## Error\nERROR_HEAD " + "x".repeat(10000) + " ERROR_TAIL",
      "## System information\nsmall",
      "## Recent diagnostic logs\nLOG_HEAD " + "y".repeat(10000) + " LOG_TAIL",
      "## Additional evidence\nFIFTH_SECTION",
    ].join("\n\n");
    await openErrorReportIssue(
      { title: "[macOS Alpha] Failure", body },
      runtime,
    );
    const url = new URL(
      String(vi.mocked(runtime.openExternal).mock.calls[0][0]),
    );
    const compact = url.searchParams.get("body");
    for (const evidence of [
      "ERROR_HEAD",
      "ERROR_TAIL",
      "LOG_HEAD",
      "LOG_TAIL",
      "FIFTH_SECTION",
    ])
      expect(compact).toContain(evidence);
    expect(url.toString().length).toBeGreaterThan(6800);
    expect(url.toString().length).toBeLessThanOrEqual(7000);
    expect(runtime.writeClipboard).toHaveBeenCalledWith(body);
  });

  it.each([
    "```text".repeat(1200),
    Array.from(
      { length: 200 },
      (_, i) => `## Part ${i}\n${"가😀".repeat(80)}`,
    ).join("\n"),
    Array.from(
      { length: 1500 },
      (_, i) => `## Part ${i}\n${"x".repeat(10)}`,
    ).join("\n"),
    "## Error\n### Stack\n" +
      "x".repeat(8000) +
      "\n### Message\nMESSAGE_FIRST\n" +
      "tail".repeat(2000),
  ])("keeps a URL bounded for unusual Markdown structure %#", async (body) => {
    const runtime = makeErrorReportRuntime();
    await openErrorReportIssue({ title: "Unusual report", body }, runtime);
    const url = String(vi.mocked(runtime.openExternal).mock.calls[0][0]);
    expect(url.length).toBeLessThanOrEqual(7000);
    expect(runtime.writeClipboard).toHaveBeenCalledWith(body);
    if (body.includes("MESSAGE_FIRST"))
      expect(new URL(url).searchParams.get("body")).toContain("MESSAGE_FIRST");
  });

  it.each(["copy", "issue"] as const)(
    "waits for clipboard completion before completing %s",
    async (action) => {
      let finishWrite!: () => void;
      const writing = new Promise<void>((resolve) => {
        finishWrite = resolve;
      });
      const runtime = makeErrorReportRuntime({
        writeClipboard: vi.fn(() => writing),
      });
      registerErrorReportIpc(makeContext(), runtime);
      const body = "diagnostic ".repeat(1000);
      const pending =
        action === "copy"
          ? requiredHandler("error-report:copy")(
              eventFor(1, "http://127.0.0.1:5173/"),
              body,
            )
          : openErrorReportIssue({ title: "Long report", body }, runtime);
      let completed = false;
      void pending.then(() => {
        completed = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(runtime.writeClipboard).toHaveBeenCalledWith(body);
      expect(completed).toBe(false);
      expect(runtime.openExternal).not.toHaveBeenCalled();
      finishWrite();
      await expect(pending).resolves.toEqual(
        action === "copy"
          ? { copied: true }
          : { opened: true, mode: "clipboard" },
      );
    },
  );

  it("propagates asynchronous clipboard rejection through the copy handler", async () => {
    const runtime = makeErrorReportRuntime({
      writeClipboard: vi.fn().mockRejectedValue(new Error("clipboard denied")),
    });
    registerErrorReportIpc(makeContext(), runtime);
    await expect(
      requiredHandler("error-report:copy")(
        eventFor(1, "http://127.0.0.1:5173/"),
        "diagnostic",
      ),
    ).rejects.toThrow("clipboard denied");
  });

  it("prefills a short GitHub issue without touching the clipboard", async () => {
    const runtime = makeErrorReportRuntime();

    const result = await openErrorReportIssue(
      {
        title: "[Bug] Renderer failed",
        body: "short diagnostic",
      },
      runtime,
    );
    const openedUrl = String(
      vi.mocked(runtime.openExternal).mock.calls[0]?.[0],
    );
    const parsed = new URL(openedUrl);

    expect(result).toEqual({ opened: true, mode: "prefilled" });
    expect(parsed.origin + parsed.pathname).toBe(
      "https://github.com/ucx0204/CarrotMangaTranslator/issues/new",
    );
    expect(parsed.searchParams.get("title")).toBe("[Bug] Renderer failed");
    expect(parsed.searchParams.get("body")).toBe("short diagnostic");
    expect(runtime.writeClipboard).not.toHaveBeenCalled();
  });

  it("copies long reports and opens a short paste instruction", async () => {
    const runtime = makeErrorReportRuntime();
    const body = "diagnostic ".repeat(1000);
    expect(buildGitHubIssueUrl("Long report", body).length).toBeGreaterThan(
      7000,
    );

    const result = await openErrorReportIssue(
      { title: "Long report", body },
      runtime,
    );
    const openedUrl = new URL(
      String(vi.mocked(runtime.openExternal).mock.calls[0]?.[0]),
    );

    expect(result).toEqual({ opened: true, mode: "clipboard" });
    expect(runtime.writeClipboard).toHaveBeenCalledWith(body);
    expect(openedUrl.searchParams.get("body")).toMatch(/clipboard/i);
    expect(openedUrl.toString().length).toBeLessThan(7000);
  });

  it("routes macOS Alpha diagnostics through the dedicated issue form", () => {
    const url = new URL(
      buildGitHubIssueUrl("[macOS Alpha] [Bug] Metal failed", "diagnostic"),
    );

    expect(url.searchParams.get("template")).toBe("mac_alpha.yml");
    expect(url.searchParams.get("title")).toContain("[macOS Alpha]");
    expect(url.searchParams.get("body")).toBe("diagnostic");
  });

  it("does not open the browser when clipboard fallback fails", async () => {
    const runtime = makeErrorReportRuntime({
      writeClipboard: vi.fn(async () => {
        throw new Error("clipboard unavailable");
      }),
    });

    await expect(
      openErrorReportIssue(
        {
          title: "Long report",
          body: "diagnostic ".repeat(1000),
        },
        runtime,
      ),
    ).rejects.toThrow("clipboard unavailable");
    expect(runtime.openExternal).not.toHaveBeenCalled();
  });

  it("runs prepare, copy, issue, and restart handlers through injected ports", async () => {
    const context = makeContext();
    const scheduled: Array<() => void> = [];
    const runtime = makeErrorReportRuntime({
      schedule: vi.fn((callback) => {
        scheduled.push(callback);
      }),
    });
    registerErrorReportIpc(context, runtime);
    const mainEvent = eventFor(1, "http://127.0.0.1:5173/");

    await expect(
      requiredHandler("error-report:prepare")(mainEvent, {
        source: "manual",
      }),
    ).resolves.toEqual(PREPARED_DRAFT);
    await expect(
      requiredHandler("error-report:copy")(mainEvent, "diagnostic"),
    ).resolves.toEqual({ copied: true });
    await expect(
      requiredHandler("error-report:open-issue")(mainEvent, {
        title: "Problem",
        body: "diagnostic",
      }),
    ).resolves.toEqual({ opened: true, mode: "prefilled" });
    const restart = requiredHandler("error-report:restart-app");
    await expect(restart(mainEvent)).resolves.toEqual({ restarting: true });
    await expect(restart(mainEvent)).resolves.toEqual({ restarting: true });

    expect(runtime.prepareDraft).toHaveBeenCalledWith(
      { source: "manual" },
      context.appPaths,
      undefined,
    );
    expect(runtime.writeClipboard).toHaveBeenCalledWith("diagnostic");
    expect(runtime.openExternal).toHaveBeenCalledOnce();
    expect(runtime.relaunch).toHaveBeenCalledOnce();
    expect(runtime.schedule).toHaveBeenCalledOnce();
    expect(runtime.schedule).toHaveBeenCalledWith(expect.any(Function), 100);
    expect(runtime.quit).not.toHaveBeenCalled();

    scheduled[0]?.();
    expect(runtime.quit).toHaveBeenCalledOnce();
  });

  it("runs log path, folder, and write handlers through injected ports", async () => {
    const context = makeContext();
    const runtime = makeLogsRuntime();
    registerLogsIpc(context, runtime);
    const errorWindowEvent = eventFor(3);

    await expect(
      requiredHandler("logs:get-path")(errorWindowEvent),
    ).resolves.toEqual("C:\\logs\\app.log");
    await expect(
      requiredHandler("logs:open-folder")(errorWindowEvent),
    ).resolves.toEqual({
      opened: true,
      logPath: "C:\\logs\\app.log",
    });
    await expect(
      requiredHandler("logs:write")(
        errorWindowEvent,
        "warn",
        "renderer warning",
        { code: 42 },
      ),
    ).resolves.toEqual({ logged: true });

    expect(runtime.showItemInFolder).toHaveBeenCalledWith("C:\\logs\\app.log");
    expect(runtime.writeLog).toHaveBeenCalledWith(
      "warn",
      "renderer: renderer warning",
      { code: 42 },
    );
    expect(runtime.translate).toHaveBeenCalledWith("ipc.labels.logWrite");
  });

  it("propagates issue, folder, and draft failures without later side effects", async () => {
    const context = makeContext();
    const issueRuntime = makeErrorReportRuntime({
      openExternal: vi.fn(async () => {
        throw new Error("browser unavailable");
      }),
      prepareDraft: vi.fn(async () => {
        throw new Error("draft unavailable");
      }),
    });
    registerErrorReportIpc(context, issueRuntime);
    const mainEvent = eventFor(1, "http://127.0.0.1:5173/");

    await expect(
      requiredHandler("error-report:prepare")(mainEvent, {
        source: "manual",
      }),
    ).rejects.toThrow("draft unavailable");
    await expect(
      requiredHandler("error-report:open-issue")(mainEvent, {
        title: "Problem",
        body: "diagnostic",
      }),
    ).rejects.toThrow("browser unavailable");
    expect(issueRuntime.writeClipboard).not.toHaveBeenCalled();

    electronMock.handlers.clear();
    const logsRuntime = makeLogsRuntime({
      showItemInFolder: vi.fn(async () => {
        throw new Error("folder unavailable");
      }),
    });
    registerLogsIpc(context, logsRuntime);
    await expect(
      requiredHandler("logs:open-folder")(mainEvent),
    ).rejects.toThrow("folder unavailable");
    expect(logsRuntime.writeLog).not.toHaveBeenCalled();
  });

  it("allows main, panel, and isolated error windows but rejects unknown senders", async () => {
    const context = makeContext();
    const runtime = makeErrorReportRuntime();
    const logsRuntime = makeLogsRuntime();
    registerErrorReportIpc(context, runtime);
    registerLogsIpc(context, logsRuntime);
    const copy = requiredHandler("error-report:copy");
    const openLogs = requiredHandler("logs:open-folder");

    await expect(
      copy(eventFor(1, "http://127.0.0.1:5173/"), "main report"),
    ).resolves.toEqual({ copied: true });
    await expect(
      copy(eventFor(2, "http://127.0.0.1:5173/panel"), "panel report"),
    ).resolves.toEqual({ copied: true });
    await expect(openLogs(eventFor(3))).resolves.toEqual({
      opened: true,
      logPath: "C:\\logs\\app.log",
    });
    await expect(
      copy(eventFor(4, "http://127.0.0.1:5173/"), "forged report"),
    ).rejects.toThrow("translated:ipc.errors.untrusted");
    await expect(
      copy(eventFor(2, "https://evil.example/"), "forged panel report"),
    ).rejects.toThrow("translated:ipc.errors.untrusted");
  });

  it("rejects oversized bodies and unknown context fields at the contract boundary", async () => {
    const context = makeContext();
    const runtime = makeErrorReportRuntime();
    registerErrorReportIpc(context, runtime);
    const copy = requiredHandler("error-report:copy");
    const prepare = requiredHandler("error-report:prepare");
    const mainEvent = eventFor(1, "http://127.0.0.1:5173/");

    await expect(copy(mainEvent, "한".repeat(21_000))).rejects.toThrow();
    await expect(
      prepare(mainEvent, {
        source: "manual",
        rawSettings: { apiKey: "no" },
      }),
    ).rejects.toThrow();
    expect(runtime.writeClipboard).not.toHaveBeenCalled();
    expect(runtime.prepareDraft).not.toHaveBeenCalled();
  });
});

function requiredHandler(channel: string): IpcHandler {
  const handler = electronMock.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing handler: ${channel}`);
  }
  return handler;
}

function eventFor(id: number, url?: string): IpcEvent {
  return {
    sender: { id },
    ...(url ? { senderFrame: { url } } : {}),
  };
}

function makeContext(): ErrorReportIpcContext {
  return {
    appPaths: makeAppPaths(),
    getMainWindow: () => ({
      isDestroyed: () => false,
      webContents: {
        id: 1,
        getURL: () => "http://127.0.0.1:5173/",
      },
    }),
    panelWindows: {
      isPanelSender: (id) => id === 2,
    },
    errorReportWindows: {
      isTrustedSender: (id) => id === 3,
    },
  };
}

function makeErrorReportRuntime(
  overrides: Partial<ErrorReportIpcRuntime> = {},
): ErrorReportIpcRuntime {
  return {
    isAllowedNavigation: sameOrigin,
    quit: vi.fn(),
    openExternal: vi.fn(async () => undefined),
    prepareDraft: vi.fn(async () => PREPARED_DRAFT),
    relaunch: vi.fn(),
    schedule: vi.fn(),
    translate: (key) => `translated:${key}`,
    writeClipboard: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makeLogsRuntime(
  overrides: Partial<LogsIpcRuntime> = {},
): LogsIpcRuntime {
  return {
    getLogPath: () => "C:\\logs\\app.log",
    isAllowedNavigation: sameOrigin,
    showItemInFolder: vi.fn(async () => undefined),
    translate: vi.fn((key) => `translated:${key}`),
    writeLog: vi.fn(),
    ...overrides,
  };
}

function sameOrigin(targetUrl: string, rendererUrl: string): boolean {
  return new URL(targetUrl).origin === new URL(rendererUrl).origin;
}

function makeAppPaths(): AppPaths {
  return {
    dataRoot: "C:\\app",
    executableDir: "C:\\app",
    fontsDir: "C:\\app\\fonts",
    isPackaged: false,
    libraryDir: "C:\\app\\library",
    llamaRuntimeDir: "C:\\app\\llama",
    llamaServerPath: "C:\\app\\llama\\server.exe",
    logFile: "C:\\app\\logs\\app.log",
    logsDir: "C:\\app\\logs",
    ocrRuntimeDir: "C:\\app\\ocr",
    repoRoot: "C:\\repo",
    resourcesDir: "C:\\app\\resources",
    runtimeDir: "C:\\app\\runtime",
    settingsPath: "C:\\app\\settings.json",
    toolsDir: "C:\\app\\tools",
  };
}
