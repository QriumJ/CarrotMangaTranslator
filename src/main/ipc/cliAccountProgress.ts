import type { AppOperationLease } from "../appOperationRegistry";
import type { RuntimeAssetProgress } from "../runtimeSupport/modelDownloads";

/** Shared download → official browser authentication presentation. */
export function cliAccountProgress(
  lease: AppOperationLease,
  waitingForUser: boolean,
) {
  return [
    (progress: RuntimeAssetProgress) =>
      lease.updateActivity({
        phase: "cli-downloading",
        waitingForUser: false,
        progressCurrent: progress.progressBytes,
        progressTotal: progress.progressTotalBytes,
        progressUnit: "bytes",
      }),
    () =>
      lease.updateActivity({
        phase: "waiting-for-user",
        waitingForUser,
        progressCurrent: undefined,
        progressTotal: undefined,
        progressUnit: undefined,
      }),
  ] as const;
}
