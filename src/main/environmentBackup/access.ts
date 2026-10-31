let exclusive = false;
const pending = new Set<Promise<unknown>>();
const allowed = new Set([
  "app-update:install",
  "app-update:get",
  "app-update:acknowledge",
  "app-update:cancel",
  "app-operation:cancel",
  "app-operation:get-active",
  "app-operation:get-all",
  "app-activity:get",
]);

export async function trackEnvironmentAccess<T>(
  channel: string,
  action: () => Promise<T> | T,
): Promise<T> {
  if (channel.startsWith("environment-backup:") || allowed.has(channel))
    return action();
  if (exclusive)
    throw new Error(
      "A backup or restore is in progress. Wait until it finishes.",
    );
  const task = Promise.resolve().then(action);
  pending.add(task);
  try {
    return await task;
  } finally {
    pending.delete(task);
  }
}
export async function suspendEnvironmentAccess(
  signal?: AbortSignal,
): Promise<() => void> {
  if (exclusive)
    throw new Error("An environment backup operation is already active.");
  exclusive = true;
  let onAbort: (() => void) | undefined;
  try {
    signal?.throwIfAborted();
    const drained = Promise.allSettled([...pending]);
    if (signal) {
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
      });
      const results = await Promise.race([drained, aborted]);
      if (results.some((result) => result.status === "rejected"))
        throw new Error("A pending file operation failed");
    } else await drained;
  } catch (error) {
    exclusive = false;
    throw error;
  } finally {
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
  return () => {
    exclusive = false;
  };
}
