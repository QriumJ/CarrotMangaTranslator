import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AppPaths } from "../src/main/appPaths";
import {
  GrokAcpClient,
  type GrokConnection,
} from "../src/main/grok/grokAcpClient";
import { startGrokRuntime as startOfficialRuntime } from "../src/main/grok/grokRuntime";
import {
  authenticateGrok as authenticateOfficialGrok,
  readGrokAccount as readOfficialAccount,
} from "../src/main/grok/grokAccount";
import { registerGrokAccountIpc } from "../src/main/ipc/grokAccountIpc";
import { AppActivityGate } from "../src/main/appActivityGate";
import { AppOperationRegistry } from "../src/main/appOperationRegistry";
import type { IpcContext } from "../src/main/ipc/context";
import { grokIpcContracts } from "../src/shared/ipcGrokContracts";

const mocked = vi.hoisted(() => ({
  find: vi.fn(),
  install: vi.fn(),
  spawn: vi.fn(),
  handlers: new Map<string, () => Promise<unknown>>(),
}));
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: mocked.spawn,
}));
vi.mock("electron", () => ({
  app: { isPackaged: false, getPath: () => "", getVersion: () => "test" },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown) => Promise<unknown>) =>
      mocked.handlers.set(channel, () =>
        handler({
          sender: { id: 1 },
          senderFrame: { url: "http://127.0.0.1:5173/" },
        }),
      ),
  },
}));
const startGrokRuntime: typeof startOfficialRuntime = (paths, instructions) =>
  startOfficialRuntime(paths, instructions, mocked.find);
const accountAdapter = {
  find: mocked.find,
  install: mocked.install,
  start: startGrokRuntime,
};
function invoke(channel: string) {
  const handler = mocked.handlers.get(channel);
  if (!handler) throw new Error(`Missing IPC handler: ${channel}`);
  return handler();
}
const readGrokAccount = (paths: AppPaths) =>
  readOfficialAccount(paths, accountAdapter);
const authenticateGrok: typeof authenticateOfficialGrok = (
  paths,
  action,
  signal,
  progress,
  authenticate,
) =>
  authenticateOfficialGrok(
    paths,
    action,
    signal,
    progress,
    authenticate,
    accountAdapter,
  );
let root: string;
let paths: AppPaths;
let client: {
  request: ReturnType<typeof vi.fn<GrokConnection["request"]>>;
  close: ReturnType<typeof vi.fn<GrokConnection["close"]>>;
  onNotification: () => void;
  onRequest: () => Promise<unknown>;
  onFailure: () => void;
};
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "grok-account-test-"));
  paths = { dataRoot: root } as AppPaths;
  mocked.find.mockReset().mockReturnValue("official-grok");
  mocked.install.mockReset().mockResolvedValue("official-grok");
  mocked.spawn.mockReset().mockImplementation(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("close", 0));
    return child;
  });
  client = {
    request: vi.fn(async () => ({ authMethods: [{ id: "cached_token" }] })),
    close: vi.fn(async () => undefined),
    onNotification: () => undefined,
    onRequest: async () => ({}),
    onFailure: () => undefined,
  };
  vi.spyOn(GrokAcpClient, "start").mockReturnValue(client);
  mocked.handlers.clear();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

it("starts isolated official ACP with only question and Carrot discovery tools", async () => {
  const runtime = await startGrokRuntime(paths, "Carrot rules");
  const profile = await readFile(
    join(root, "chat/grok-runtime/carrot-agent.md"),
    "utf8",
  );
  expect(profile).toContain("GrokBuild:use_tool");
  expect(profile).toContain("injectDefaultTools: false");
  expect(profile).not.toContain("read_file");
  expect(profile).not.toContain("bash");
  expect(GrokAcpClient.start).toHaveBeenCalledWith(
    "official-grok",
    [
      "agent",
      "--no-leader",
      "--agent-profile",
      join(root, "chat/grok-runtime/carrot-agent.md"),
      "stdio",
    ],
    runtime.cwd,
    expect.objectContaining({
      GROK_HOME: join(root, "grok"),
      GROK_DISABLE_AUTOUPDATER: "1",
    }),
  );
  expect(client.request).toHaveBeenCalledWith(
    "initialize",
    expect.objectContaining({
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
    }),
  );
  await runtime.client.close();
});
it("never installs on a runtime probe and closes a failed initialization", async () => {
  mocked.find.mockReturnValue(null);
  await expect(startGrokRuntime(paths)).rejects.toThrow("아직 설치");
  expect(mocked.install).not.toHaveBeenCalled();
  mocked.find.mockReturnValue("official-grok");
  client.request.mockRejectedValueOnce(new Error("initialization failed"));
  await expect(startGrokRuntime(paths)).rejects.toThrow(
    "initialization failed",
  );
  expect(client.close).toHaveBeenCalledOnce();
});
it("coalesces read-only polls and does not authenticate or invoke login", async () => {
  const first = readGrokAccount(paths),
    second = readGrokAccount(paths);
  expect(first).toBe(second);
  expect(await first).toMatchObject({
    authenticated: true,
    runtimeInstalled: true,
  });
  expect(client.request).toHaveBeenCalledTimes(1);
  expect(mocked.spawn).not.toHaveBeenCalled();
  expect(mocked.install).not.toHaveBeenCalled();
  expect(client.close).toHaveBeenCalledOnce();
});
it("downloads on first login, forwards progress and invokes official OAuth", async () => {
  mocked.find.mockReturnValue(null);
  mocked.install.mockImplementation(async (_root, _provider, options) => {
    options.onProgress({ progressBytes: 25, progressTotalBytes: 100 });
    mocked.find.mockReturnValue("official-grok");
    return "official-grok";
  });
  const progress = vi.fn(),
    authenticate = vi.fn();
  const controller = new AbortController();
  expect(
    await authenticateGrok(
      paths,
      "login",
      controller.signal,
      progress,
      authenticate,
    ),
  ).toMatchObject({ authenticated: true });
  expect(progress).toHaveBeenCalledWith({
    progressBytes: 25,
    progressTotalBytes: 100,
  });
  expect(authenticate).toHaveBeenCalledOnce();
  expect(mocked.spawn).toHaveBeenCalledWith(
    "official-grok",
    ["login", "--oauth"],
    expect.objectContaining({
      signal: controller.signal,
      windowsHide: true,
      stdio: "ignore",
    }),
  );
  await authenticateGrok(paths, "logout");
  expect(mocked.spawn).toHaveBeenLastCalledWith(
    "official-grok",
    ["logout"],
    expect.any(Object),
  );
  expect(mocked.install).toHaveBeenCalledOnce();
});
it("reports login failure and cancellation without pretending the account connected", async () => {
  mocked.spawn.mockImplementation(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("close", 1));
    return child;
  });
  await expect(authenticateGrok(paths, "login")).rejects.toThrow("인증에 실패");
  mocked.spawn.mockImplementation(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("error", new Error("cancelled")));
    return child;
  });
  await expect(authenticateGrok(paths, "login")).rejects.toThrow("cancelled");
  expect(client.request).not.toHaveBeenCalled();
});
it("publishes first-use progress through the shared cancellable account operation", async () => {
  const operations = new AppOperationRegistry(new AppActivityGate());
  mocked.find.mockReturnValue(null);
  mocked.install.mockImplementation(async (_root, _provider, options) => {
    options.onProgress({ progressBytes: 50, progressTotalBytes: 100 });
    expect(operations.currentActivity).toMatchObject({
      kind: "grok-auth",
      phase: "cli-downloading",
      progressCurrent: 50,
    });
    mocked.find.mockReturnValue("official-grok");
    return "official-grok";
  });
  mocked.spawn.mockImplementation(() => {
    expect(operations.currentActivity).toMatchObject({
      phase: "waiting-for-user",
      waitingForUser: true,
    });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("close", 0));
    return child;
  });
  registerGrokAccountIpc(
    {
      appPaths: paths,
      operations,
      getMainWindow: () => ({
        isDestroyed: () => false,
        webContents: { id: 1, getURL: () => "http://127.0.0.1:5173/" },
      }),
    } as IpcContext,
    { readGrokAccount, authenticateGrok },
  );
  await expect(invoke("grok:account")).resolves.toMatchObject({
    runtimeInstalled: false,
  });
  await expect(invoke("grok:login")).resolves.toMatchObject({
    authenticated: true,
  });
  expect(operations.hasActive).toBe(false);
  mocked.spawn.mockImplementation(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("close", 0));
    return child;
  });
  await invoke("grok:logout");
  expect(operations.hasActive).toBe(false);
  expect(
    grokIpcContracts.loginGrokAccount.args.safeParse(["untrusted-argument"])
      .success,
  ).toBe(false);
});
