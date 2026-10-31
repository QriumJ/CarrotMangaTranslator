import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppUpdateService,
  type AppUpdatePort,
} from "../src/main/application/appUpdateService";
import {
  AppUpdateError,
  compareAppVersions,
  findAppUpdate,
  type AppUpdateRelease,
} from "../src/main/application/appUpdateRelease";
import {
  AppUpdatePreparationCoordinator,
  type UpdateWindow,
} from "../src/main/application/appUpdatePreparation";
import {
  suspendEnvironmentAccess,
  trackEnvironmentAccess,
} from "../src/main/environmentBackup/access";

const release: AppUpdateRelease = {
  version: "3.8.0",
  tag: "v3.8.0",
  baseUrl: "https://example.test/",
  name: "update.exe",
  url: "https://example.test/update.exe",
  size: 100,
  sha256: "a".repeat(64),
};
function setup(
  overrides: Partial<AppUpdatePort> = {},
  platform: "windows" | "macos" = "windows",
) {
  const port: AppUpdatePort = {
    check: vi.fn(async () => release),
    download: vi.fn(async () => undefined),
    install: vi.fn(async () => undefined),
    savePreference: vi.fn(async () => undefined),
    busy: () => false,
    emit: vi.fn(),
    reportError: vi.fn(),
    ...overrides,
  };
  return {
    port,
    service: new AppUpdateService(
      {
        currentVersion: "3.7.8",
        platform,
        supported: true,
        checkOnStartup: true,
      },
      port,
    ),
  };
}
afterEach(() => vi.useRealTimers());

describe("explicit app update workflow", () => {
  it("checks without downloading and never installs without a separate request", async () => {
    const { service, port } = setup();
    expect((await service.check()).phase).toBe("available");
    expect(port.download).not.toHaveBeenCalled();
    expect((await service.download()).phase).toBe("ready");
    expect(port.install).not.toHaveBeenCalled();
    expect((await service.install()).phase).toBe("installing");
    expect(port.install).toHaveBeenCalledTimes(1);
  });
  it("reports current and network errors without retries", async () => {
    const { service, port } = setup({ check: vi.fn(async () => null) });
    expect((await service.check()).phase).toBe("current");
    vi.mocked(port.check).mockRejectedValue(new Error("offline"));
    expect(await service.check()).toMatchObject({
      phase: "error",
      error: "network",
    });
    expect(port.check).toHaveBeenCalledTimes(2);
  });
  it("coalesces double clicks and cancels an active transfer", async () => {
    const { service, port } = setup({
      download: vi.fn(
        (_r, signal, progress) =>
          new Promise<void>((_resolve, reject) => {
            progress(25);
            signal.addEventListener("abort", () => reject(signal.reason));
          }),
      ),
    });
    await service.check();
    const first = service.download();
    expect(service.download()).toBe(first);
    await Promise.resolve();
    expect(service.snapshot).toMatchObject({
      phase: "downloading",
      transferred: 25,
    });
    service.cancel();
    expect((await first).phase).toBe("available");
    expect(port.install).not.toHaveBeenCalled();
  });
  it("permits background download but requires another click after work finishes", async () => {
    let busy = true;
    const { service, port } = setup({ busy: () => busy });
    await service.check();
    await service.download();
    expect(await service.install()).toMatchObject({ error: "busy" });
    busy = false;
    service.refreshBusy();
    expect(port.install).not.toHaveBeenCalled();
    await service.install();
    expect(port.install).toHaveBeenCalledTimes(1);
  });
  it.each(["save", "install", "busy"] as const)(
    "keeps the download retryable after %s prevents installation",
    async (code) => {
      const { service, port } = setup({
        install: vi.fn(async () => {
          throw new AppUpdateError(code, "blocked");
        }),
      });
      await service.check();
      await service.download();
      expect(await service.install()).toMatchObject({
        phase: "error",
        error: code,
        errorStage: "install",
      });
      expect(port.download).toHaveBeenCalledTimes(1);
      vi.mocked(port.install).mockResolvedValue();
      expect((await service.install()).phase).toBe("installing");
    },
  );
  it("requires a new download when a cached installer changes", async () => {
    const { service, port } = setup({
      install: vi.fn(async () => {
        throw new AppUpdateError("integrity", "tampered");
      }),
    });
    await service.check();
    await service.download();
    expect(await service.install()).toMatchObject({
      error: "integrity",
      errorStage: "download",
    });
    await service.install();
    expect(port.install).toHaveBeenCalledTimes(1);
    await service.download();
    expect(port.download).toHaveBeenCalledTimes(2);
  });
  it("opens macOS installers without entering the Windows quit state", async () => {
    const { service } = setup({}, "macos");
    await service.check();
    await service.download();
    expect((await service.install()).phase).toBe("ready");
  });
  it("does not offer installation in development", async () => {
    const { port } = setup();
    const service = new AppUpdateService(
      {
        currentVersion: "3.7.8",
        platform: "windows",
        supported: false,
        checkOnStartup: true,
      },
      port,
    );
    expect(await service.check()).toMatchObject({ error: "unsupported" });
    expect(port.check).not.toHaveBeenCalled();
  });
});

function remoteRelease(
  version = "3.8.0",
  platform: "windows" | "macos" = "windows",
) {
  const tag = `v${version}`;
  const base = `https://github.com/ucx0204/CarrotMangaTranslator/releases/download/${tag}/`;
  const name =
    platform === "windows"
      ? `CarrotMangaTranslator-Setup-${tag}.exe`
      : `CarrotMangaTranslator-${version}-macOS-arm64.dmg`;
  const sums =
    platform === "windows"
      ? "SHA256SUMS-windows.txt"
      : "SHA256SUMS-macOS-arm64.txt";
  const assets = [name, sums, "latest.yml"].map((name) => ({
    name,
    size: 100,
    browser_download_url: base + name,
  }));
  return { tag_name: tag, prerelease: false, draft: false, assets };
}
function remoteFetch(
  releases: ReturnType<typeof remoteRelease>[],
  checksum?: string,
) {
  return vi.fn<typeof fetch>(
    async (input) =>
      new Response(
        String(input).includes("api.github")
          ? JSON.stringify(releases)
          : (checksum ?? `${"a".repeat(64)}  ${releases[0].assets[0].name}\n`),
      ),
  );
}
describe("stable platform release discovery", () => {
  it.each(["windows", "macos"] as const)(
    "selects and verifies the exact %s asset",
    async (platform) => {
      const record = remoteRelease("3.8.0", platform);
      expect(
        await findAppUpdate(
          "3.7.8",
          platform,
          new AbortController().signal,
          remoteFetch([record]),
        ),
      ).toMatchObject({
        version: "3.8.0",
        name: record.assets[0].name,
        sha256: "a".repeat(64),
      });
    },
  );
  it("excludes prereleases, model releases and downgrades", async () => {
    const records = [
      remoteRelease("3.7.7"),
      { ...remoteRelease("4.0.0"), prerelease: true },
      { ...remoteRelease("10.0.0"), assets: [] },
    ];
    expect(
      await findAppUpdate(
        "3.7.8",
        "windows",
        new AbortController().signal,
        remoteFetch(records),
      ),
    ).toBeNull();
    expect(compareAppVersions("3.10.0", "3.9.99")).toBe(1);
  });
  it.each([0, 1, 2])(
    "rejects a partially published release missing asset %i",
    async (index) => {
      const record = remoteRelease();
      if (index === 0)
        record.assets.push(remoteRelease("3.8.0", "macos").assets[0]);
      record.assets.splice(index, 1);
      await expect(
        findAppUpdate(
          "3.7.8",
          "windows",
          new AbortController().signal,
          remoteFetch([record]),
        ),
      ).rejects.toMatchObject({ code: "incomplete" });
    },
  );
  it("rejects checksum ambiguity and arbitrary URLs", async () => {
    const record = remoteRelease();
    const line = `${"a".repeat(64)}  ${record.assets[0].name}\n`;
    await expect(
      findAppUpdate(
        "3.7.8",
        "windows",
        new AbortController().signal,
        remoteFetch([record], line + line),
      ),
    ).rejects.toMatchObject({ code: "integrity" });
    record.assets[0].browser_download_url = "https://example.test/update.exe";
    await expect(
      findAppUpdate(
        "3.7.8",
        "windows",
        new AbortController().signal,
        remoteFetch([record]),
      ),
    ).rejects.toMatchObject({ code: "integrity" });
  });
});

describe("editor acknowledgement barrier", () => {
  it("locks every window, flushes detached editors then the main window", async () => {
    const coordinator = new AppUpdatePreparationCoordinator();
    const calls: string[] = [];
    const windows: UpdateWindow[] = [1, 2].map((id) => ({
      id,
      main: id === 1,
      send: (request) => {
        calls.push(`${id}:${request.stage}`);
        if (request.stage !== "release")
          coordinator.acknowledge(id, { ...request, stage: request.stage });
      },
    }));
    const release = await coordinator.lockAndFlush(windows);
    expect(calls).toEqual(["1:lock", "2:lock", "2:flush", "1:flush"]);
    release();
    expect(calls.slice(-2)).toEqual(["1:release", "2:release"]);
  });
  it("rejects failed saving and unlocks every window", async () => {
    const coordinator = new AppUpdatePreparationCoordinator();
    const send = vi.fn<UpdateWindow["send"]>((request) => {
      if (request.stage !== "release")
        coordinator.acknowledge(1, {
          ...request,
          stage: request.stage,
          ...(request.stage === "flush" ? { error: "disk full" } : {}),
        });
    });
    await expect(
      coordinator.lockAndFlush([{ id: 1, main: true, send }]),
    ).rejects.toMatchObject({ code: "save" });
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ stage: "release" }),
    );
  });
  it("times out missing replies, rejects forged replies, and ignores late replies", async () => {
    vi.useFakeTimers();
    const coordinator = new AppUpdatePreparationCoordinator();
    const send = vi.fn<UpdateWindow["send"]>();
    const task = coordinator.lockAndFlush([{ id: 1, main: true, send }]);
    const request = send.mock.calls[0][0];
    expect(coordinator.acknowledge(2, { id: request.id, stage: "lock" })).toBe(
      false,
    );
    const rejected = expect(task).rejects.toMatchObject({ code: "save" });
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(coordinator.acknowledge(1, { id: request.id, stage: "lock" })).toBe(
      false,
    );
  });
  it("reopens IPC after a drain timeout without treating it as installation approval", async () => {
    let finish!: () => void;
    const write = trackEnvironmentAccess(
      "settings:save",
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await Promise.resolve();
    const controller = new AbortController();
    const task = suspendEnvironmentAccess(controller.signal);
    controller.abort(new Error("save timeout"));
    await expect(task).rejects.toThrow("save timeout");
    expect(await trackEnvironmentAccess("settings:save", () => true)).toBe(
      true,
    );
    finish();
    await write;
  });
  it.each([false, true])(
    "requires admitted writes to succeed before installation (failure=%s)",
    async (fails) => {
      let finish!: () => void;
      let fail!: (error: Error) => void;
      const write = trackEnvironmentAccess(
        "settings:save",
        () =>
          new Promise<void>((resolve, reject) => {
            finish = resolve;
            fail = reject;
          }),
      );
      const observed = fails
        ? expect(write).rejects.toThrow("disk full")
        : expect(write).resolves.toBeUndefined();
      await Promise.resolve();
      const suspension = suspendEnvironmentAccess(new AbortController().signal);
      await expect(suspendEnvironmentAccess()).rejects.toThrow(
        "already active",
      );
      if (fails) {
        fail(new Error("disk full"));
        await expect(suspension).rejects.toThrow(
          "pending file operation failed",
        );
      } else {
        finish();
        const release = await suspension;
        await expect(
          trackEnvironmentAccess("settings:save", () => true),
        ).rejects.toThrow("backup");
        release();
      }
      await observed;
      await expect(
        trackEnvironmentAccess("settings:save", () => true),
      ).resolves.toBe(true);
    },
  );
  it("rejects an already cancelled preparation without leaving writes blocked", async () => {
    await expect(
      suspendEnvironmentAccess(AbortSignal.abort(new Error("cancelled"))),
    ).rejects.toThrow("cancelled");
    await expect(
      trackEnvironmentAccess("settings:save", () => true),
    ).resolves.toBe(true);
  });
});
