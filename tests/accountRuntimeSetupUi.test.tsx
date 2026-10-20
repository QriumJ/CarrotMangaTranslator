/** @vitest-environment jsdom */
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeAppI18n } from "../src/renderer/src/appI18n";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import { claudeConnection } from "../src/renderer/src/api/claudeConnection";
import { codexConnection } from "../src/renderer/src/api/codexConnection";
import { ClaudeSettingsFields } from "../src/renderer/src/components/settingsModal/ClaudeSettingsFields";
import { CodexAccountField } from "../src/renderer/src/components/settingsModal/CodexAccountField";
import { ChatPanel } from "../src/renderer/src/features/chat/ChatPanel";
import { resolveAccountConnectStage } from "../src/renderer/src/lib/accountRuntimePresentation";
import { useAccountAuthOperation } from "../src/renderer/src/hooks/useAccountAuthOperation";
import type { MangaApi } from "../src/shared/mangaApi";
import type { AppOperationActivityEvent } from "../src/shared/appOperationTypes";
import type { ChatSession } from "../src/shared/chatTypes";
import type { ClaudeAccount } from "../src/shared/claudeTypes";
import type { CodexAccountSnapshot } from "../src/shared/codexAccountTypes";

const claudeMissing: ClaudeAccount = {
  runtimeInstalled: false,
  authenticated: false,
  email: null,
  plan: null,
  version: "",
  models: [],
};
const claudeConnected: ClaudeAccount = {
  runtimeInstalled: true,
  authenticated: true,
  email: "reader@example.com",
  plan: "max",
  version: "2.1.0",
  models: [],
};
const codexMissing: CodexAccountSnapshot = {
  runtimeInstalled: false,
  authenticated: false,
  accountKind: null,
  email: null,
  planType: null,
  requiresOpenaiAuth: true,
  appServerVersion: "",
  models: [],
};

let listeners: Set<(event: AppOperationActivityEvent) => void>;
let updatedAt = 1;
const cancel = vi.fn<MangaApi["cancelAppOperation"]>(async () => ({
  accepted: true,
}));

function emitOperation(
  patch: Partial<AppOperationActivityEvent> = {},
): AppOperationActivityEvent {
  const event: AppOperationActivityEvent = {
    id: "auth-1",
    kind: "claude-auth",
    status: "running",
    phase: "cli-downloading",
    progressCurrent: 5 * 1024 * 1024,
    progressTotal: 20 * 1024 * 1024,
    progressUnit: "bytes",
    mutatesLibrary: false,
    cancellable: true,
    startedAt: 1,
    updatedAt: updatedAt++,
    ...patch,
  };
  act(() => listeners.forEach((listener) => listener(event)));
  return event;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function installBridge(overrides: Partial<MangaApi>): void {
  window.mangaApi = createTestMangaGatewayStub({
    onAppOperationActivity: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    cancelAppOperation: cancel,
    ...overrides,
  });
}

beforeEach(async () => {
  await initializeAppI18n("ko");
  listeners = new Set();
  cancel.mockClear();
});
afterEach(cleanup);

describe("resolveAccountConnectStage", () => {
  it("keeps legacy installs on the normal sign-in and walks first use through download", () => {
    const base = { activity: null, pending: false, failed: false };
    expect(resolveAccountConnectStage({ ...base, runtimeMissing: false })).toBe(
      "connect",
    );
    expect(resolveAccountConnectStage({ ...base, runtimeMissing: true })).toBe(
      "download",
    );
    expect(
      resolveAccountConnectStage({
        ...base,
        runtimeMissing: true,
        failed: true,
      }),
    ).toBe("retry-download");
    expect(
      resolveAccountConnectStage({
        ...base,
        runtimeMissing: true,
        pending: true,
      }),
    ).toBe("downloading");
    expect(
      resolveAccountConnectStage({
        ...base,
        runtimeMissing: true,
        activity: { phase: "waiting-for-user" },
      }),
    ).toBe("signing-in");
  });
});

describe("Claude account first use", () => {
  it("explains the one-time download, shows live progress with cancel, retries after failure and ends connected", async () => {
    const first = deferred<ClaudeAccount>();
    const login = vi
      .fn<MangaApi["loginClaudeAccount"]>()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(claudeConnected);
    const read = vi.fn<MangaApi["getClaudeAccount"]>(async () => claudeMissing);
    installBridge({ getClaudeAccount: read, loginClaudeAccount: login });
    claudeConnection.publish(claudeMissing);
    render(<ClaudeSettingsFields model="default" effort="high" accountOnly />);

    expect(
      screen.getByText("Claude Code 실행 파일이 아직 없습니다"),
    ).toBeTruthy();
    expect(screen.getByText(/한 번만 내려받아 이 PC에 보관/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "내려받고 API 계정 연결" }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "내려받고 로그인" }));
    expect(login).toHaveBeenCalledWith("subscription");
    expect(screen.getByRole("button", { name: "내려받는 중…" })).toHaveProperty(
      "disabled",
      true,
    );

    const operation = emitOperation();
    const progress = screen.getByRole("progressbar");
    expect(progress.getAttribute("aria-valuenow")).toBe(
      String(5 * 1024 * 1024),
    );
    expect(progress.getAttribute("aria-valuetext")).toContain("/");
    expect(screen.getByRole("status").textContent).toContain(
      "AI 실행 파일을 내려받는 중…",
    );
    expect(
      screen.getByRole("button", { name: "내려받고 API 계정 연결" }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "현재 작업 취소" }));
    expect(cancel).toHaveBeenCalledWith(operation.id);

    emitOperation({ status: "failed", phase: undefined });
    await act(async () => first.reject(new Error("network unreachable")));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Claude Code 실행 파일을 내려받지 못했습니다",
    );
    expect(alert.textContent).toContain("network unreachable");
    expect(read).toHaveBeenCalled();
    expect(screen.queryByRole("progressbar")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "다시 내려받고 로그인" }),
    );
    await screen.findByText("reader@example.com · max");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/실행 파일이 아직 없습니다/)).toBeNull();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeTruthy();
  });

  it("treats a cancelled download as the user's choice, not a failure", async () => {
    const pending = deferred<ClaudeAccount>();
    installBridge({
      getClaudeAccount: async () => claudeMissing,
      loginClaudeAccount: () => pending.promise,
    });
    claudeConnection.publish(claudeMissing);
    render(<ClaudeSettingsFields model="default" effort="high" accountOnly />);
    fireEvent.click(
      screen.getByRole("button", { name: "내려받고 API 계정 연결" }),
    );
    emitOperation();
    emitOperation({ status: "cancelling" });
    expect(
      screen.getByRole("button", { name: "취소 요청 중…" }),
    ).toHaveProperty("disabled", true);
    emitOperation({ status: "cancelled", phase: undefined });
    await act(async () => pending.reject(new Error("cancelled")));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "내려받고 API 계정 연결" }),
      ).toHaveProperty("disabled", false),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the original sign-in labels for legacy installs without runtimeInstalled", () => {
    const legacy = { ...claudeMissing };
    delete legacy.runtimeInstalled;
    installBridge({ getClaudeAccount: async () => legacy });
    claudeConnection.publish(legacy);
    render(<ClaudeSettingsFields model="default" effort="high" accountOnly />);
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "API 계정 연결" })).toBeTruthy();
    expect(screen.queryByText(/실행 파일이 아직 없습니다/)).toBeNull();
  });
});

describe("Codex account first use", () => {
  it("follows download, browser sign-in and the connected state on one button", async () => {
    const pending = deferred<CodexAccountSnapshot>();
    installBridge({
      getCodexAccount: async () => codexMissing,
      loginCodexAccount: () => pending.promise,
    });
    render(<CodexAccountField controlsBusy={false} />);
    const start = await screen.findByRole("button", {
      name: "내려받고 ChatGPT로 로그인",
    });
    expect(screen.getByText("Codex 실행 파일이 아직 없습니다")).toBeTruthy();
    fireEvent.click(start);
    emitOperation({ kind: "codex-auth" });
    expect(screen.getByRole("button", { name: "내려받는 중…" })).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    emitOperation({
      kind: "codex-auth",
      phase: "waiting-for-user",
      waitingForUser: true,
      progressCurrent: undefined,
      progressTotal: undefined,
      progressUnit: undefined,
    });
    expect(
      screen.getByRole("button", { name: "브라우저 로그인 대기 중…" }),
    ).toBeTruthy();
    emitOperation({ kind: "codex-auth", status: "completed" });
    await act(async () =>
      pending.resolve({
        ...codexMissing,
        runtimeInstalled: true,
        authenticated: true,
        accountKind: "chatgpt",
        email: "reader@example.com",
      }),
    );
    expect(await screen.findByText("reader@example.com")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/실행 파일이 아직 없습니다/)).toBeNull();
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeTruthy();
  });

  it("offers a retry download after a failed first sign-in", async () => {
    installBridge({
      getCodexAccount: async () => codexMissing,
      loginCodexAccount: async () => {
        throw new Error("checksum mismatch");
      },
    });
    render(<CodexAccountField controlsBusy={false} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "내려받고 ChatGPT로 로그인" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Codex 실행 파일을 내려받지 못했습니다",
    );
    expect(alert.textContent).toContain("Codex 로그인에 실패했습니다.");
    expect(
      screen.getByRole("button", { name: "다시 내려받고 ChatGPT로 로그인" }),
    ).toBeTruthy();
  });
});

describe("chat sign-in first use", () => {
  it("explains the download and shows the same cancellable operation", async () => {
    const session: ChatSession = {
      version: 1,
      id: "00000000-0000-4000-a000-000000000001",
      title: "새 대화",
      runtime: "codex",
      nativeThreadId: null,
      model: null,
      effort: null,
      state: "idle",
      createdAt: 1,
      updatedAt: 1,
      items: [],
      checkpoint: [],
      question: null,
    };
    const pending = deferred<CodexAccountSnapshot>();
    const login = vi.fn(() => pending.promise);
    installBridge({
      listChats: async () => [session],
      readChat: async () => session,
      createChat: async () => session,
      onChatEvent: () => () => undefined,
      getCodexAccount: async () => codexMissing,
      loginCodexAccount: login,
    });
    codexConnection.publish(codexMissing);
    render(<ChatPanel enabled />);
    const button = await screen.findByRole("button", {
      name: "내려받고 ChatGPT 로그인",
    });
    expect(screen.getByText(/공식 Codex 실행 파일을 한 번만/)).toBeTruthy();
    fireEvent.click(button);
    expect(login).toHaveBeenCalledOnce();
    const operation = emitOperation({ kind: "codex-auth" });
    expect(screen.getByRole("progressbar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "현재 작업 취소" }));
    expect(cancel).toHaveBeenCalledWith(operation.id);
    await act(async () => pending.resolve(codexMissing));
  });
});

describe("useAccountAuthOperation", () => {
  it("drops the previous provider's running or cancelled sign-in when the kind changes", () => {
    installBridge({});
    const initialProps: { kind: "claude-auth" | "codex-auth" } = {
      kind: "claude-auth",
    };
    const { result, rerender } = renderHook(
      ({ kind }) => useAccountAuthOperation(kind),
      { initialProps },
    );
    emitOperation({ kind: "claude-auth", id: "claude-1" });
    expect(result.current.activity?.id).toBe("claude-1");

    rerender({ kind: "codex-auth" });
    expect(result.current.activity).toBeNull();
    expect(result.current.cancelled).toBe(false);
    act(() => result.current.cancel());
    expect(cancel).not.toHaveBeenCalled();
    // A late Claude event must not leak into the Codex view either.
    emitOperation({ kind: "claude-auth", id: "claude-1", status: "cancelled" });
    expect(result.current.activity).toBeNull();
    expect(result.current.cancelled).toBe(false);

    rerender({ kind: "claude-auth" });
    emitOperation({ kind: "claude-auth", id: "claude-2", startedAt: 5 });
    emitOperation({
      kind: "claude-auth",
      id: "claude-2",
      startedAt: 5,
      status: "cancelled",
    });
    expect(result.current.cancelled).toBe(true);
    rerender({ kind: "codex-auth" });
    expect(result.current.cancelled).toBe(false);
  });

  it("keeps a newer attempt over a late hydration snapshot and older terminal events", async () => {
    const hydration = deferred<AppOperationActivityEvent[]>();
    installBridge({ getActiveAppOperations: () => hydration.promise });
    const { result } = renderHook(() => useAccountAuthOperation("codex-auth"));
    emitOperation({ kind: "codex-auth", id: "retry", startedAt: 20 });

    await act(async () =>
      hydration.resolve([
        {
          ...emitOperationShape("first"),
          kind: "codex-auth",
          startedAt: 10,
          updatedAt: updatedAt + 100,
        },
      ]),
    );
    expect(result.current.activity?.id).toBe("retry");

    emitOperation({
      kind: "codex-auth",
      id: "first",
      startedAt: 10,
      status: "failed",
      updatedAt: updatedAt + 200,
    });
    expect(result.current.activity?.id).toBe("retry");
    expect(result.current.cancelled).toBe(false);

    act(() => result.current.cancel());
    expect(cancel).toHaveBeenCalledWith("retry");
  });
});

function emitOperationShape(id: string): AppOperationActivityEvent {
  return {
    id,
    kind: "claude-auth",
    status: "running",
    phase: "cli-downloading",
    mutatesLibrary: false,
    cancellable: true,
    startedAt: 1,
    updatedAt: updatedAt++,
  };
}
