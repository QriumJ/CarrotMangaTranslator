import type { TranslationRuntimePort } from "../pipeline/translationRuntimePort";

type Sessions = {
  endpoint?: ReturnType<TranslationRuntimePort["startEndpointSession"]>;
  ocr?: ReturnType<
    NonNullable<TranslationRuntimePort["startPreparedHayaiSession"]>
  >;
  closing?: Promise<void>;
  cleanupFailure?: Error;
  disposed: boolean;
};

/** The workflow owns processes; nested page pipelines borrow their handles. */
export function createWorkflowSessions(runtime: TranslationRuntimePort) {
  const state: Sessions = { disposed: false };
  const close = () => closeWorkflowSessions(state);
  return {
    close,
    dispose: () => {
      state.disposed = true;
      return close();
    },
    runtime: {
      ...runtime,
      startEndpointSession: async (options) => {
        await state.closing;
        assertSessionsAvailable(state, options.abortSignal);
        if (
          state.endpoint &&
          endpointExited((await state.endpoint).handle.child)
        )
          await close();
        await state.closing;
        assertSessionsAvailable(state, options.abortSignal);
        state.endpoint ??= runtime.startEndpointSession(options);
        const endpoint = await state.endpoint;
        assertSessionsAvailable(state, options.abortSignal);
        return { handle: endpoint.handle, dispose: () => Promise.resolve() };
      },
      collectPreparedHayaiHints: async (options) => {
        await state.closing;
        assertSessionsAvailable(state, options.abortSignal);
        if (!runtime.startPreparedHayaiSession) {
          if (!runtime.collectPreparedHayaiHints)
            throw new Error("HayaiOCR 판독을 사용할 수 없습니다.");
          return runtime.collectPreparedHayaiHints(options);
        }
        state.ocr ??= runtime.startPreparedHayaiSession(options);
        const ocr = await state.ocr;
        assertSessionsAvailable(state, options.abortSignal);
        return ocr.collect(options);
      },
    } satisfies TranslationRuntimePort,
  };
}

function assertSessionsAvailable(state: Sessions, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (state.cleanupFailure) throw state.cleanupFailure;
  if (state.disposed)
    throw Object.assign(new Error("페이지 작업 런타임이 종료되었습니다."), {
      nonRetriable: true,
    });
}

function closeWorkflowSessions(state: Sessions): Promise<void> {
  if (state.cleanupFailure) return Promise.reject(state.cleanupFailure);
  if (state.closing) return state.closing;
  const resources = [state.endpoint, state.ocr];
  state.endpoint = undefined;
  state.ocr = undefined;
  state.closing = disposeSessions(state, resources).finally(() => {
    state.closing = undefined;
  });
  return state.closing;
}

async function disposeSessions(
  state: Sessions,
  resources: Array<Promise<{ dispose: () => Promise<void> }> | undefined>,
) {
  const results = await Promise.allSettled(
    resources.map((resource) =>
      resource?.then(
        (session) => session.dispose(),
        // Acquisition failures are reported by the caller; no session was acquired.
        () => undefined,
      ),
    ),
  );
  const errors = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  if (errors.length) {
    state.cleanupFailure = Object.assign(
      new AggregateError(errors, "페이지 작업 런타임 종료에 실패했습니다."),
      { nonRetriable: true },
    );
    throw state.cleanupFailure;
  }
}

function endpointExited(child: unknown): boolean {
  if (!child || typeof child !== "object") return false;
  return (
    ("exitCode" in child &&
      child.exitCode !== null &&
      child.exitCode !== undefined) ||
    ("signalCode" in child &&
      child.signalCode !== null &&
      child.signalCode !== undefined)
  );
}
