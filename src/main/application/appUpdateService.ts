import type { AppUpdateState } from "../../shared/appUpdate";
import { AppUpdateError, type AppUpdateRelease } from "./appUpdateRelease";

export type AppUpdatePort = {
  check: (signal: AbortSignal) => Promise<AppUpdateRelease | null>;
  download: (
    release: AppUpdateRelease,
    signal: AbortSignal,
    progress: (transferred: number) => void,
  ) => Promise<void>;
  install: (release: AppUpdateRelease) => Promise<void>;
  savePreference: (enabled: boolean) => Promise<void>;
  busy: () => boolean;
  emit: (state: AppUpdateState) => void;
  reportError: (error: unknown) => void;
};

/** Single authority for all windows; commands are serialized, downloads remain cancellable. */
export class AppUpdateService {
  private state: AppUpdateState;
  private release: AppUpdateRelease | null = null;
  private action: Promise<AppUpdateState> | null = null;
  private downloadAbort: AbortController | null = null;
  private downloaded = false;

  constructor(
    initial: Pick<
      AppUpdateState,
      "currentVersion" | "platform" | "supported" | "checkOnStartup"
    >,
    private readonly port: AppUpdatePort,
  ) {
    this.state = { ...initial, revision: 0, phase: "idle", busy: false };
  }
  get snapshot(): AppUpdateState {
    return { ...this.state, busy: this.port.busy() };
  }
  refreshBusy(): void {
    this.publish({});
  }
  restorePreference(enabled: boolean): void {
    this.publish({ checkOnStartup: enabled });
  }
  async preference(enabled: boolean): Promise<AppUpdateState> {
    await this.port.savePreference(enabled);
    this.publish({ checkOnStartup: enabled });
    return this.snapshot;
  }
  check(): Promise<AppUpdateState> {
    if (this.downloaded) return Promise.resolve(this.snapshot);
    return this.run("check", async () => {
      this.publish({
        phase: "checking",
        error: undefined,
        errorStage: undefined,
      });
      this.release = await this.port.check(AbortSignal.timeout(15_000));
      this.publish({
        phase: this.release ? "available" : "current",
        version: this.release?.version,
        total: this.release?.size,
        transferred: undefined,
      });
    });
  }
  download(): Promise<AppUpdateState> {
    return this.run("download", async () => {
      if (!this.release || this.downloaded) return;
      const controller = new AbortController();
      this.downloadAbort = controller;
      this.publish({
        phase: "downloading",
        error: undefined,
        errorStage: undefined,
        transferred: 0,
      });
      try {
        await this.port.download(
          this.release,
          controller.signal,
          (transferred) => this.publish({ transferred }),
        );
        controller.signal.throwIfAborted();
        this.downloaded = true;
        this.publish({ phase: "ready", transferred: this.release.size });
      } catch (error) {
        if (!controller.signal.aborted) throw error;
        this.publish({ phase: "available", transferred: undefined });
      } finally {
        this.downloadAbort = null;
      }
    });
  }
  cancel(): AppUpdateState {
    this.downloadAbort?.abort();
    return this.snapshot;
  }
  install(): Promise<AppUpdateState> {
    if (this.state.phase === "installing")
      return Promise.resolve(this.snapshot);
    return this.run("install", async () => {
      if (!this.release || !this.downloaded) return;
      if (this.port.busy())
        throw new AppUpdateError("busy", "Active work prevents installation");
      this.publish({
        phase: "preparing",
        error: undefined,
        errorStage: undefined,
      });
      await this.port.install(this.release);
      this.publish({
        phase: this.state.platform === "macos" ? "ready" : "installing",
      });
    });
  }
  private run(
    stage: NonNullable<AppUpdateState["errorStage"]>,
    perform: () => Promise<void>,
  ): Promise<AppUpdateState> {
    if (this.action) return this.action;
    this.action = Promise.resolve()
      .then(async () => {
        try {
          if (!this.state.supported)
            throw new AppUpdateError(
              "unsupported",
              "Updates require a supported packaged app",
            );
          await perform();
        } catch (error) {
          this.port.reportError(error);
          const integrity =
            error instanceof AppUpdateError && error.code === "integrity";
          if (integrity) this.downloaded = false;
          this.publish({
            phase: "error",
            errorStage: integrity && stage === "install" ? "download" : stage,
            error:
              error instanceof AppUpdateError
                ? error.code
                : stage === "check"
                  ? "network"
                  : stage === "download"
                    ? "download"
                    : "install",
          });
        }
        return this.snapshot;
      })
      .finally(() => {
        this.action = null;
      });
    return this.action;
  }
  private publish(patch: Partial<AppUpdateState>): void {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 };
    this.port.emit(this.snapshot);
  }
}
