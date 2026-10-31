import { randomUUID } from "node:crypto";
import type {
  AppUpdateAcknowledgement,
  AppUpdatePreparation,
} from "../../shared/appUpdate";
import { AppUpdateError } from "./appUpdateRelease";

export type UpdateWindow = {
  id: number;
  main: boolean;
  send: (request: AppUpdatePreparation) => void;
};

/** All windows lock first; detached editors flush before their owning main window. */
export class AppUpdatePreparationCoordinator {
  private pending = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }
  >();
  acknowledge(sender: number, response: AppUpdateAcknowledgement): boolean {
    const entry = this.pending.get(
      `${response.id}/${response.stage}/${sender}`,
    );
    if (!entry) return false;
    if (response.error)
      entry.reject(new AppUpdateError("save", response.error));
    else entry.resolve();
    return true;
  }
  async lockAndFlush(windows: UpdateWindow[]): Promise<() => void> {
    const id = randomUUID();
    const release = () => {
      for (const [key, entry] of this.pending) {
        if (key.startsWith(`${id}/`))
          entry.reject(new AppUpdateError("save", "Preparation cancelled"));
      }
      for (const window of windows) window.send({ id, stage: "release" });
    };
    try {
      await this.request(windows, { id, stage: "lock" });
      await this.request(
        windows.filter((w) => !w.main),
        { id, stage: "flush" },
      );
      await this.request(
        windows.filter((w) => w.main),
        { id, stage: "flush" },
      );
      return release;
    } catch (error) {
      release();
      throw error;
    }
  }
  private async request(
    windows: UpdateWindow[],
    request: AppUpdatePreparation,
  ): Promise<void> {
    await Promise.all(
      windows.map(
        (window) =>
          new Promise<void>((resolve, reject) => {
            const key = `${request.id}/${request.stage}/${window.id}`;
            const finish = (error?: Error) => {
              clearTimeout(timer);
              this.pending.delete(key);
              if (error) reject(error);
              else resolve();
            };
            const timer = setTimeout(
              () =>
                finish(
                  new AppUpdateError(
                    "save",
                    "Editor did not acknowledge saving",
                  ),
                ),
              15_000,
            );
            this.pending.set(key, { resolve: () => finish(), reject: finish });
            try {
              window.send(request);
            } catch (error) {
              finish(
                new AppUpdateError(
                  "save",
                  `Editor window became unavailable: ${String(error)}`,
                ),
              );
            }
          }),
      ),
    );
  }
}
