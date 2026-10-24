/** @vitest-environment jsdom */

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import type {
  ErrorReportContext,
  ErrorReportDraft,
} from "../src/shared/errorReportTypes";

const gatewayMocks = {
  prepareErrorReport: vi.fn(),
  copyErrorReport: vi.fn(),
  openErrorReportIssue: vi.fn(),
  githubReportAccount: vi.fn(),
  submitGitHubReport: vi.fn(),
  openLogFolder: vi.fn(),
};

import { ErrorReportDialog } from "../src/renderer/src/components/ErrorReportDialog";

const CONTEXT: ErrorReportContext = {
  source: "manual",
  summary: "번역 작업 실패",
  message: "모델 응답 오류",
  stack: "Error: 모델 응답 오류\n    at <app>\\renderer.js:10:4",
  jobStage: "translate",
};

const DRAFT: ErrorReportDraft = {
  reportId: "12345678-1234-4234-8234-123456789012",
  defaultTitle: "[Bug] 번역 작업 실패",
  errorMarkdown: "## 오류\n\n모델 응답 오류",
  systemMarkdown: "## 시스템\n\n- App: 1.5.0\n- Windows: 11",
  logsMarkdown: "## 최근 오류 로그\n\n```text\n[ERROR] request failed\n```",
  redactionCount: 3,
  truncated: false,
};

beforeEach(() => {
  window.mangaApi = createTestMangaGatewayStub(gatewayMocks);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  gatewayMocks.prepareErrorReport.mockResolvedValue(DRAFT);
  gatewayMocks.githubReportAccount.mockResolvedValue({
    configured: true,
    login: "reporter",
  });
  gatewayMocks.submitGitHubReport.mockResolvedValue({
    opened: true,
    issueUrl: "https://github.com/ucx0204/CarrotMangaTranslator/issues/200",
  });
  gatewayMocks.copyErrorReport.mockResolvedValue({ copied: true });
  gatewayMocks.openErrorReportIssue.mockResolvedValue({
    opened: true,
    mode: "prefilled",
  });
  gatewayMocks.openLogFolder.mockResolvedValue({ opened: true });
});

afterEach(() => {
  cleanup();
  window.mangaApi = createTestMangaGatewayStub();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("ErrorReportDialog", () => {
  it("leads with sign-in, shows a copyable device code, then enables one-click submission", async () => {
    let approved = false;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const pendingState = {
      configured: true,
      userCode: "ABCD-EFGH",
      expiresAt: Date.now() + 900000,
    };
    gatewayMocks.githubReportAccount.mockImplementation(
      async (action: string) => {
        if (action === "start" || action === "reopen") return pendingState;
        if (action === "poll")
          return approved
            ? { configured: true, login: "reporter" }
            : pendingState;
        return { configured: true };
      },
    );
    render(<ErrorReportDialog context={CONTEXT} onClose={vi.fn()} />);
    await screen.findByDisplayValue(DRAFT.defaultTitle);
    expect(
      await screen.findByText("신고하려면 GitHub 로그인이 필요합니다"),
    ).toBeTruthy();
    // The footer's primary action is the next step, never a dimmed report.
    expect(screen.queryByRole("button", { name: "신고하기" })).toBeNull();
    const signIn = screen.getByRole("button", { name: "GitHub로 로그인" });
    expect(signIn).toHaveProperty("disabled", false);
    fireEvent.click(signIn);

    const code = await screen.findByLabelText("GitHub 인증 코드");
    expect(code.textContent).toBe("ABCD-EFGH");
    expect(
      screen.getByRole("region", { name: "GitHub에 아래 코드를 입력하세요" }),
    ).toBeTruthy();
    expect(screen.getByText("GitHub 승인을 기다리는 중…")).toBeTruthy();
    // The footer owns the one reopen control and it is a live action.
    const reopenButtons = screen.getAllByRole("button", {
      name: "브라우저 다시 열기",
    });
    expect(reopenButtons).toHaveLength(1);
    expect(reopenButtons[0]).toHaveProperty("disabled", false);

    fireEvent.click(screen.getByRole("button", { name: "코드 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("ABCD-EFGH"));
    expect(await screen.findByRole("button", { name: "복사됨" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "브라우저 다시 열기" }));
    await waitFor(() =>
      expect(gatewayMocks.githubReportAccount).toHaveBeenCalledWith("reopen"),
    );
    expect(screen.getByLabelText("GitHub 인증 코드").textContent).toBe(
      "ABCD-EFGH",
    );
    // Reopening neither restarts the device flow nor posts a report.
    expect(
      gatewayMocks.githubReportAccount.mock.calls.filter(
        ([action]) => action === "start",
      ),
    ).toHaveLength(1);
    expect(gatewayMocks.submitGitHubReport).not.toHaveBeenCalled();

    approved = true;
    await screen.findByText(
      "reporter 계정으로 신고합니다.",
      {},
      { timeout: 3000 },
    );
    expect(screen.queryByLabelText("GitHub 인증 코드")).toBeNull();
    const report = screen.getByRole("button", { name: "신고하기" });
    expect(report).toHaveProperty("disabled", false);
    fireEvent.click(report);
    await waitFor(() =>
      expect(gatewayMocks.submitGitHubReport).toHaveBeenCalledOnce(),
    );
    expect(gatewayMocks.openErrorReportIssue).not.toHaveBeenCalled();
  });

  it("keeps the device code usable when clipboard access fails and allows copying again", async () => {
    const writeText = vi
      .fn()
      .mockRejectedValueOnce(new Error("Clipboard permission denied"))
      .mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    gatewayMocks.githubReportAccount.mockResolvedValue({
      configured: true,
      userCode: "ABCD-EFGH",
    });
    render(<ErrorReportDialog context={CONTEXT} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "코드 복사" }));
    const failedCopy = await screen.findByRole("button", {
      name: "복사 실패 · 직접 입력",
    });
    expect(screen.getByLabelText("GitHub 인증 코드").textContent).toBe(
      "ABCD-EFGH",
    );
    expect(
      screen.getByRole("button", { name: "브라우저 다시 열기" }),
    ).toHaveProperty("disabled", false);
    fireEvent.click(failedCopy);
    await screen.findByRole("button", { name: "복사됨" });
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(gatewayMocks.submitGitHubReport).not.toHaveBeenCalled();
  });

  it("cancels a pending device sign-in back to the sign-in step", async () => {
    gatewayMocks.githubReportAccount.mockImplementation(
      async (action: string) =>
        action === "start" || action === "poll"
          ? { configured: true, userCode: "WXYZ-1234" }
          : { configured: true },
    );
    render(<ErrorReportDialog context={CONTEXT} onClose={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "GitHub로 로그인" }),
    );
    await screen.findByLabelText("GitHub 인증 코드");
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() =>
      expect(gatewayMocks.githubReportAccount).toHaveBeenCalledWith(
        "disconnect",
      ),
    );
    expect(
      await screen.findByRole("button", { name: "GitHub로 로그인" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("GitHub 인증 코드")).toBeNull();
  });

  it("locks the pending reopen and cancel controls while an account action runs", async () => {
    const reopen = createDeferred<unknown>();
    const pendingState = { configured: true, userCode: "WXYZ-1234" };
    gatewayMocks.githubReportAccount.mockImplementation(
      async (action: string) => {
        if (action === "reopen") return reopen.promise;
        if (action === "start" || action === "poll") return pendingState;
        return { configured: true };
      },
    );
    render(<ErrorReportDialog context={CONTEXT} onClose={vi.fn()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "GitHub로 로그인" }),
    );
    await screen.findByLabelText("GitHub 인증 코드");
    fireEvent.click(screen.getByRole("button", { name: "브라우저 다시 열기" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "브라우저 다시 열기" }),
      ).toHaveProperty("disabled", true),
    );
    expect(screen.getByRole("button", { name: "취소" })).toHaveProperty(
      "disabled",
      true,
    );
    reopen.resolve(pendingState);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "브라우저 다시 열기" }),
      ).toHaveProperty("disabled", false),
    );
    expect(screen.getByRole("button", { name: "취소" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(gatewayMocks.submitGitHubReport).not.toHaveBeenCalled();
  });

  it("shows submission progress, retries the same snapshot, then offers the created issue", async () => {
    const pendingSubmit = createDeferred<unknown>();
    gatewayMocks.submitGitHubReport
      .mockReturnValueOnce(pendingSubmit.promise)
      .mockResolvedValueOnce({
        opened: true,
        issueUrl: "https://github.com/ucx0204/CarrotMangaTranslator/issues/201",
      });
    render(<ErrorReportDialog context={CONTEXT} onClose={vi.fn()} />);
    const title = await screen.findByDisplayValue(DRAFT.defaultTitle);
    fireEvent.click(await screen.findByRole("button", { name: "신고하기" }));
    expect(
      await screen.findByRole("button", { name: "전체 로그 업로드·신고 중…" }),
    ).toHaveProperty("disabled", true);
    expect(title.closest("fieldset")).toHaveProperty("disabled", true);

    pendingSubmit.reject(new Error("network failure"));
    const retry = await screen.findByRole("button", { name: "신고 다시 시도" });
    expect(retry).toHaveProperty("disabled", false);
    expect(title.closest("fieldset")).toHaveProperty("disabled", true);
    fireEvent.click(retry);
    expect(
      await screen.findByRole("button", { name: "등록된 이슈 열기" }),
    ).toHaveProperty("disabled", false);
    expect(gatewayMocks.submitGitHubReport).toHaveBeenCalledTimes(2);
    expect(gatewayMocks.submitGitHubReport.mock.calls[1]?.[0]).toEqual(
      gatewayMocks.submitGitHubReport.mock.calls[0]?.[0],
    );
  });

  it("explains an unconfigured build instead of offering sign-in", async () => {
    gatewayMocks.githubReportAccount.mockResolvedValue({ configured: false });
    render(<ErrorReportDialog context={CONTEXT} onClose={vi.fn()} />);
    expect(
      await screen.findByText(/이 빌드에는 GitHub 로그인 설정이 없습니다/),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "GitHub로 로그인" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "신고하기" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("keeps authorization errors visible and supports signing out", async () => {
    gatewayMocks.githubReportAccount.mockResolvedValue({
      configured: true,
      login: "reporter",
    });
    render(<ErrorReportDialog context={CONTEXT} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "로그아웃" }));
    await waitFor(() =>
      expect(gatewayMocks.githubReportAccount).toHaveBeenCalledWith(
        "disconnect",
      ),
    );
    gatewayMocks.githubReportAccount.mockRejectedValueOnce(
      new Error("private token must not render"),
    );
    fireEvent.click(await screen.findByRole("button", { name: "로그아웃" }));
    expect(
      await screen.findByText(/GitHub 로그인에 실패했습니다/),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain("private token");
  });

  it("explains preview shortening and keeps an upload failure visible", async () => {
    gatewayMocks.prepareErrorReport.mockResolvedValue({
      ...DRAFT,
      truncated: true,
    });
    gatewayMocks.submitGitHubReport.mockRejectedValueOnce(
      new Error("network failure"),
    );
    render(<ErrorReportDialog context={CONTEXT} onClose={vi.fn()} />);
    await screen.findByDisplayValue(DRAFT.defaultTitle);
    expect(
      (screen.getByLabelText("로그 미리보기") as HTMLTextAreaElement).value,
    ).toContain("선택한 전체 로그는 업로드됩니다.");
    fireEvent.click(screen.getByRole("button", { name: "신고하기" }));
    expect(
      await screen.findByText(
        "신고에 실패했습니다. 연결을 확인하고 다시 시도해 주세요.",
      ),
    ).toBeTruthy();
  });
  it("preserves execution identity and bounds direct boundary exceptions before IPC", async () => {
    render(
      <ErrorReportDialog
        context={{
          source: "react-boundary",
          summary: "x".repeat(1001),
          jobId: "run-1",
          executionId: "attempt-2",
          incidentAt: "2026-10-15T00:00:00.000Z",
        }}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(gatewayMocks.prepareErrorReport).toHaveBeenCalled(),
    );
    expect(gatewayMocks.prepareErrorReport.mock.calls[0][0]).toMatchObject({
      summary: `${"x".repeat(999)}…`,
      jobId: "run-1",
      executionId: "attempt-2",
      incidentAt: "2026-10-15T00:00:00.000Z",
    });
  });
  it("exposes an accessible editable report and defaults diagnostics on", async () => {
    render(<ErrorReportDialog context={CONTEXT} onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "오류 보고" })).toBeTruthy();
    expect(screen.getByText(/신고 내용과 로그는 공개됩니다/)).toBeTruthy();

    const title = await screen.findByDisplayValue("[Bug] 번역 작업 실패");
    const description = screen.getByLabelText("오류 직전에 무엇을 했나요?");
    const systemToggle = screen.getByRole("checkbox", {
      name: "시스템 정보",
    }) as HTMLInputElement;
    const logsToggle = screen.getByRole("checkbox", {
      name: "전체 로그 (현재·이전 실행)",
    }) as HTMLInputElement;
    const preview = screen.getByLabelText(
      "로그 미리보기",
    ) as HTMLTextAreaElement;

    expect(title).toHaveProperty("required", true);
    expect(systemToggle.checked).toBe(true);
    expect(logsToggle.checked).toBe(true);
    expect(preview.readOnly).toBe(true);
    expect(preview.value).toContain("## 오류");
    expect(preview.value).toContain("## 시스템");
    expect(preview.value).toContain("## 최근 오류 로그");
    expect(preview.value).toContain("마스킹된 항목: 3개");

    fireEvent.change(description, {
      target: { value: "번역 버튼을 눌렀습니다." },
    });
    fireEvent.click(systemToggle);
    fireEvent.click(logsToggle);

    expect(preview.value).toContain("번역 버튼을 눌렀습니다.");
    expect(preview.value).not.toContain("## 시스템");
    expect(preview.value).not.toContain("## 최근 오류 로그");
  });

  it("runs copy, GitHub, log, close, and fatal restart actions", async () => {
    const onClose = vi.fn();
    const onRestart = vi.fn().mockResolvedValue(undefined);
    render(
      <ErrorReportDialog
        context={CONTEXT}
        onClose={onClose}
        fatal
        onRestart={onRestart}
      />,
    );
    await screen.findByDisplayValue("[Bug] 번역 작업 실패");

    fireEvent.change(screen.getByLabelText("오류 직전에 무엇을 했나요?"), {
      target: { value: "설정 저장 직후" },
    });
    fireEvent.click(screen.getByRole("button", { name: "미리보기 복사" }));
    await waitFor(() =>
      expect(gatewayMocks.copyErrorReport).toHaveBeenCalledOnce(),
    );
    expect(gatewayMocks.copyErrorReport.mock.calls[0]?.[0]).toContain(
      "설정 저장 직후",
    );
    expect(
      await screen.findByText("화면의 진단 미리보기를 복사했습니다."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "신고하기" }));
    await waitFor(() =>
      expect(gatewayMocks.submitGitHubReport).toHaveBeenCalledOnce(),
    );
    expect(gatewayMocks.submitGitHubReport).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "[Bug] 번역 작업 실패",
        reportId: DRAFT.reportId,
        description: "설정 저장 직후",
        includeLogs: true,
        includeSystem: true,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "로그 폴더 열기" }));
    await waitFor(() =>
      expect(gatewayMocks.openLogFolder).toHaveBeenCalledOnce(),
    );

    fireEvent.click(screen.getByRole("button", { name: "앱 다시 시작" }));
    await waitFor(() => expect(onRestart).toHaveBeenCalledOnce());

    const closeButtons = screen.getAllByRole("button", { name: "닫기" });
    fireEvent.click(closeButtons.at(-1) as HTMLButtonElement);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("reports a created issue even when the default browser cannot open", async () => {
    gatewayMocks.submitGitHubReport.mockResolvedValue({
      opened: false,
      issueUrl: "https://github.com/ucx0204/CarrotMangaTranslator/issues/200",
    });
    render(<ErrorReportDialog context={CONTEXT} onClose={vi.fn()} />);
    await screen.findByDisplayValue("[Bug] 번역 작업 실패");

    fireEvent.click(screen.getByRole("button", { name: "신고하기" }));

    expect(
      await screen.findByText(
        "이슈 등록은 완료했습니다. 브라우저에서 다음 주소를 여세요: https://github.com/ucx0204/CarrotMangaTranslator/issues/200",
      ),
    ).toBeTruthy();
  });

  it("blocks duplicate actions and keeps failures visible for retry", async () => {
    const pendingCopy = createDeferred<unknown>();
    gatewayMocks.copyErrorReport.mockReturnValue(pendingCopy.promise);
    render(<ErrorReportDialog context={CONTEXT} onClose={vi.fn()} />);
    await screen.findByDisplayValue("[Bug] 번역 작업 실패");

    const copyButton = screen.getByRole("button", {
      name: "미리보기 복사",
    });
    fireEvent.click(copyButton);
    fireEvent.click(copyButton);

    expect(gatewayMocks.copyErrorReport).toHaveBeenCalledOnce();
    expect(copyButton).toHaveProperty("disabled", true);

    pendingCopy.reject(new Error("clipboard unavailable"));
    expect(
      await screen.findByText(
        "진단 정보를 복사하지 못했습니다. 다시 시도해 주세요.",
      ),
    ).toBeTruthy();
    await waitFor(() => expect(copyButton).toHaveProperty("disabled", false));
  });

  it("does not expose raw details when diagnostic preparation fails", async () => {
    gatewayMocks.prepareErrorReport.mockRejectedValueOnce(
      new Error("raw secret: sk-test"),
    );
    render(<ErrorReportDialog context={CONTEXT} onClose={vi.fn()} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("진단 정보를 준비하지 못했습니다.");
    expect(document.body.textContent).not.toContain("sk-test");
    expect(screen.getByRole("button", { name: "신고하기" })).toHaveProperty(
      "disabled",
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(
      await screen.findByDisplayValue("[Bug] 번역 작업 실패"),
    ).toBeTruthy();
    expect(gatewayMocks.prepareErrorReport).toHaveBeenCalledTimes(2);
  });
});

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
