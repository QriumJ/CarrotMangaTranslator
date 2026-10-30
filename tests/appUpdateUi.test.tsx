/** @vitest-environment jsdom */
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeAppI18n } from "../src/renderer/src/appI18n";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import {
  AppUpdateSettings,
  AppUpdateStatus,
} from "../src/renderer/src/components/AppUpdateSection";
import { StatusDockButton } from "../src/renderer/src/components/StatusDockButton";
import { receiveAppUpdate } from "../src/renderer/src/lib/appUpdateStore";
import type { AppUpdateState } from "../src/shared/appUpdate";
import type { JobState } from "../src/shared/jobTypes";

const BUSY_NOTE = "작업이 끝나면 설치할 수 있습니다.";
let revision = 0;
const base: Omit<AppUpdateState, "revision"> = {
  currentVersion: "3.7.8",
  platform: "windows",
  supported: true,
  checkOnStartup: true,
  phase: "idle",
  busy: false,
};

function show(patch: Partial<AppUpdateState>): void {
  const state = { ...base, ...patch, revision: ++revision };
  act(() => receiveAppUpdate(state));
}

function button(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

function description(element: HTMLElement): string | undefined {
  const id = element.getAttribute("aria-describedby");
  return id ? (document.getElementById(id)?.textContent ?? "") : undefined;
}

const api = {
  checkAppUpdate: vi.fn(),
  downloadAppUpdate: vi.fn(),
  cancelAppUpdate: vi.fn(),
  installAppUpdate: vi.fn(),
  setAppUpdateCheckOnStartup: vi.fn(),
};

beforeEach(async () => {
  await initializeAppI18n("ko");
  for (const action of Object.values(api)) {
    action.mockReset();
    action.mockImplementation(async () => ({ ...base, revision }));
  }
  window.mangaApi = createTestMangaGatewayStub(api);
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("status-center update entry", () => {
  it("stays hidden until there is news", () => {
    show({ phase: "current" });
    const { container } = render(<AppUpdateStatus />);
    expect(container.innerHTML).toBe("");
  });

  it("offers one primary download beside the new and current versions", () => {
    show({ phase: "available", version: "3.8.0" });
    render(<AppUpdateStatus />);
    screen.getByText("새 버전 3.8.0");
    screen.getByText("현재 버전 3.7.8");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(button("다운로드"));
    expect(api.downloadAppUpdate).toHaveBeenCalledOnce();
  });

  it("keeps progress, percentage, and cancel on one row", () => {
    show({
      phase: "downloading",
      version: "3.8.0",
      transferred: 43,
      total: 100,
    });
    render(<AppUpdateStatus />);
    const bar = screen.getByRole("progressbar", {
      name: "3.8.0 다운로드 중…",
    });
    expect(bar.getAttribute("aria-valuetext")).toBe("43%");
    const cancel = button("다운로드 취소");
    expect(cancel.parentElement).toBe(bar.parentElement);
    fireEvent.click(cancel);
    expect(api.cancelAppUpdate).toHaveBeenCalledOnce();
  });

  it("disables installation while work runs and says why", () => {
    show({ phase: "ready", version: "3.8.0", busy: true });
    render(<AppUpdateStatus />);
    const install = button("재시작하여 업데이트");
    expect(install.disabled).toBe(true);
    expect(description(install)).toBe(BUSY_NOTE);
  });

  it("opens the installer on macOS", () => {
    show({ phase: "ready", version: "3.8.0", platform: "macos" });
    render(<AppUpdateStatus />);
    fireEvent.click(button("설치 파일 열기"));
    expect(api.installAppUpdate).toHaveBeenCalledOnce();
  });

  it("shows pending phases without actions", () => {
    show({ phase: "preparing", version: "3.8.0" });
    render(<AppUpdateStatus />);
    screen.getByText("편집 내용 저장 중…");
    screen.getByRole("progressbar");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("separates a save failure and retries the failed stage", () => {
    show({ phase: "error", error: "save", errorStage: "install" });
    render(<AppUpdateStatus />);
    expect(screen.getByRole("alert").textContent).toContain(
      "편집 내용을 저장하지 못해 설치를 중단했습니다",
    );
    fireEvent.click(button("재시작하여 업데이트"));
    expect(api.installAppUpdate).toHaveBeenCalledOnce();
  });

  it("explains a blocked install retry once", () => {
    show({
      phase: "error",
      error: "install",
      errorStage: "install",
      busy: true,
    });
    const { rerender } = render(<AppUpdateStatus />);
    expect(description(button("재시작하여 업데이트"))).toBe(BUSY_NOTE);
    show({ phase: "error", error: "busy", errorStage: "install", busy: true });
    rerender(<AppUpdateStatus />);
    expect(screen.queryByText(BUSY_NOTE)).toBeNull();
    expect(button("재시작하여 업데이트").disabled).toBe(true);
  });

  it("retries a download or check from its own stage", () => {
    show({ phase: "error", error: "integrity", errorStage: "download" });
    const { rerender } = render(<AppUpdateStatus />);
    fireEvent.click(button("다운로드"));
    expect(api.downloadAppUpdate).toHaveBeenCalledOnce();
    show({ phase: "error", error: "network", errorStage: "check" });
    rerender(<AppUpdateStatus />);
    fireEvent.click(button("업데이트 확인"));
    expect(api.checkAppUpdate).toHaveBeenCalledOnce();
  });

  it("hides retry where updates are unsupported", () => {
    show({
      phase: "error",
      error: "unsupported",
      errorStage: "check",
      supported: false,
    });
    render(<AppUpdateStatus />);
    screen.getByRole("alert");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("status center with an update", () => {
  const idleJob: JobState = {
    id: "idle",
    kind: "gemma-analysis",
    status: "idle",
    progressText: "대기 중",
  };

  function openStatusCenter(jobState: JobState): HTMLElement {
    render(
      <StatusDockButton
        jobState={jobState}
        progressSnapshot={null}
        showProgressBar={false}
        statusLines={[]}
        onCancelJob={vi.fn()}
        onClear={vi.fn()}
      />,
    );
    fireEvent.click(button("작업 센터 열기"));
    return screen.getByRole("region", { name: "작업 센터" });
  }

  it("drops the empty idle placeholder while an update is shown", () => {
    show({ phase: "downloading", version: "3.8.0", transferred: 1, total: 4 });
    const center = within(openStatusCenter(idleJob));
    center.getByRole("progressbar", { name: "3.8.0 다운로드 중…" });
    expect(center.queryByText("대기 중")).toBeNull();
  });

  it("keeps the idle placeholder when there is no update news", () => {
    show({ phase: "current" });
    const center = within(openStatusCenter(idleJob));
    center.getByText("대기 중");
  });

  it("keeps real jobs and finished results beside an update", () => {
    show({ phase: "available", version: "3.8.0" });
    let center = within(
      openStatusCenter({
        ...idleJob,
        status: "running",
        progressText: "번역 처리 중",
      }),
    );
    center.getByText("새 버전 3.8.0");
    center.getByText("번역 처리 중");
    cleanup();
    center = within(
      openStatusCenter({
        ...idleJob,
        status: "failed",
        progressText: "번역 실패",
      }),
    );
    center.getByText("새 버전 3.8.0");
    expect(center.getAllByText("번역 실패").length).toBeGreaterThan(0);
  });
});

describe("settings update section", () => {
  it("shows version, status, check, and the startup preference", () => {
    show({ phase: "available", version: "3.8.0" });
    render(<AppUpdateSettings />);
    screen.getByText("현재 버전 3.7.8");
    expect(screen.getByRole("status").textContent).toBe(
      "새 버전 3.8.0 · 작업 센터에서 계속",
    );
    fireEvent.click(button("업데이트 확인"));
    expect(api.checkAppUpdate).toHaveBeenCalledOnce();
    const startup = screen.getByRole("checkbox", {
      name: "실행 시 업데이트 확인",
    }) as HTMLInputElement;
    expect(startup.checked).toBe(true);
  });

  it("disables checking while pending and shows check failures inline", () => {
    show({ phase: "checking" });
    const { rerender } = render(<AppUpdateSettings />);
    expect(button("업데이트 확인").disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("업데이트 확인 중…");
    show({ phase: "error", error: "network", errorStage: "check" });
    rerender(<AppUpdateSettings />);
    expect(screen.getByRole("alert").textContent).toContain("업데이트 실패");
    expect(button("업데이트 확인").disabled).toBe(false);
  });

  it("names unsupported environments without a check button", () => {
    show({ supported: false, platform: "unsupported" });
    render(<AppUpdateSettings />);
    screen.getByText("이 실행 환경에서는 앱 내 업데이트를 지원하지 않습니다.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps a preference save failure visible until a later save succeeds", async () => {
    show({ phase: "current" });
    render(<AppUpdateSettings />);
    const checkbox = screen.getByRole("checkbox", {
      name: "실행 시 업데이트 확인",
    }) as HTMLInputElement;
    api.setAppUpdateCheckOnStartup.mockRejectedValueOnce(new Error("disk"));
    fireEvent.click(checkbox);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "설정을 저장하지 못했습니다.",
    );
    expect(checkbox.checked).toBe(true);
    api.setAppUpdateCheckOnStartup.mockImplementationOnce(async () => ({
      ...base,
      checkOnStartup: false,
      revision: ++revision,
    }));
    fireEvent.click(checkbox);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(checkbox.checked).toBe(false);
  });
});
