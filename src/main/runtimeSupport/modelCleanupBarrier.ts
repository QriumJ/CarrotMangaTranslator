type Cleanup = { pending: Promise<void> | null; failure?: unknown };
const cleanups = new Map<object, Cleanup>();

/** A failed native release is not evidence that its model left memory. This
 * registry is only an admission fence, never a scheduler or another job queue. */
export class ModelCleanupError extends Error {
  readonly code = "MODEL_CLEANUP_INCOMPLETE";
  constructor(cause?: unknown) {
    super(
      "로컬 모델 해제가 완료되지 않아 새 모델 실행을 차단했습니다. 정리 재시도 또는 앱 재시작 후 확인하세요.",
      cause === undefined ? undefined : { cause },
    );
    this.name = "ModelCleanupError";
  }
}

/** Coalesce concurrent releases; retain a failed resource until an explicit
 * retry acknowledges its release. No caller cancellation cancels cleanup. */
export function releaseModelResource(
  resource: object,
  dispose: () => Promise<void>,
): Promise<void> {
  const previous = cleanups.get(resource);
  if (previous?.pending) return previous.pending;
  const state: Cleanup = { pending: null };
  cleanups.set(resource, state);
  state.pending = Promise.resolve()
    .then(dispose)
    .then(
      () => {
        if (cleanups.get(resource) === state) cleanups.delete(resource);
      },
      (error: unknown) => {
        state.pending = null;
        state.failure = error;
        throw new ModelCleanupError(error);
      },
    );
  return state.pending;
}

/** Diagnostics only; neither exposes native handles nor clears the fence. */
export function modelCleanupIsBlocked(): boolean {
  return cleanups.size > 0;
}

/** Shared by UI and MCP admission. Lightweight, explicitly scoped work remains
 * available; undeclared legacy jobs conservatively count as model consumers.
 * Shared (read) model jobs only load the small pooled detectors, whose pools
 * already wait for an in-flight release, so they are refused only after a
 * release has actually failed. Exclusive loads still wait for every release. */
export function assertModelCleanupComplete(
  resources?: readonly { kind: string; access?: string }[],
): void {
  const model = resources?.filter((item) => item.kind === "model-runtime");
  if (model && model.length === 0) return;
  const sharedOnly =
    model !== undefined && model.every((item) => item.access === "read");
  const blocked = sharedOnly
    ? [...cleanups.values()].some((entry) => entry.failure !== undefined)
    : modelCleanupIsBlocked();
  if (blocked)
    throw new ModelCleanupError(
      new AggregateError(
        [...cleanups.values()].map((entry) => entry.failure),
        "Native model releases remain pending or failed.",
      ),
    );
}
