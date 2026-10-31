import { AppUpdateError } from "./appUpdateRelease";

export type AppUpdateInstallationPort = {
  suspendWork: () => () => void;
  lockAndFlushEditors: () => Promise<() => void>;
  assertReady: () => void;
  drainAccess: (signal: AbortSignal) => Promise<() => void>;
  suspendMutations: () => () => void;
  drainMutations: () => Promise<void>;
  disposeRuntimes: () => Promise<unknown>;
  launch: () => Promise<void>;
};

/** A timeout only aborts preparation. Late completions cannot reach launch. */
export async function prepareAppUpdateInstallation(
  port: AppUpdateInstallationPort,
): Promise<void> {
  const releaseLocks = [port.suspendWork()];
  let handedOff = false;
  try {
    releaseLocks.push(await port.lockAndFlushEditors());
    port.assertReady();
    releaseLocks.push(
      await port.drainAccess(AbortSignal.timeout(15_000)).catch((error) => {
        throw new AppUpdateError("save", String(error));
      }),
    );
    const resumeMutations = port.suspendMutations();
    releaseLocks.push(resumeMutations);
    await waitForUpdateDrain(port.drainMutations());
    await waitForUpdateDrain(port.disposeRuntimes());
    port.assertReady();
    await port.launch();
    // Quit cleanup may drain artifacts; editor and external intake locks remain held.
    resumeMutations();
    handedOff = true;
  } finally {
    if (!handedOff) for (const release of releaseLocks.reverse()) release();
  }
}

async function waitForUpdateDrain(task: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      task,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new AppUpdateError("save", "File operations did not finish"),
            ),
          15_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
