import React from "react";
import type { PageWorkflowTiming } from "../../../../shared/pageWorkflowTiming";
import { pageWorkflowGateway } from "../../api/pageWorkflowGateway";

/**
 * Re-read interval while the history is visible, so checkpoints of a running
 * attempt and runs started after opening both appear without reopening.
 */
export const WORKFLOW_TIMING_POLL_MS = 2_500;

export type PageWorkflowTimingsState = {
  status: "loading" | "ready" | "error";
  records: PageWorkflowTiming[];
  /** A later refresh failed; `records` still holds the last good answer. */
  refreshFailed: boolean;
  reload: () => void;
};

type LoadedState = {
  chapterId: string;
  status: "loading" | "ready" | "error";
  records: PageWorkflowTiming[];
  refreshFailed: boolean;
};

/**
 * Reads page-task timing history for one chapter and keeps re-reading it while
 * `enabled`, including after an empty or failed read. Responses for a previous
 * chapter or a closed view are dropped and no timer outlives the view.
 */
export function usePageWorkflowTimings(
  chapterId: string,
  enabled: boolean,
): PageWorkflowTimingsState {
  const [state, setState] = React.useState<LoadedState>(() =>
    initialState(chapterId),
  );
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    if (!enabled) return undefined;
    let disposed = false;
    let timer: number | null = null;
    const load = async (): Promise<void> => {
      timer = null;
      try {
        const records =
          await pageWorkflowGateway.getPageWorkflowTimings(chapterId);
        if (disposed) return;
        setState({
          chapterId,
          status: "ready",
          records,
          refreshFailed: false,
        });
      } catch (_error) {
        if (disposed) return;
        setState((current) =>
          current.chapterId === chapterId && current.status === "ready"
            ? { ...current, refreshFailed: true }
            : { ...initialState(chapterId), status: "error" },
        );
      }
      timer = window.setTimeout(() => void load(), WORKFLOW_TIMING_POLL_MS);
    };
    setState((current) =>
      current.chapterId === chapterId && current.status === "ready"
        ? current
        : initialState(chapterId),
    );
    void load();
    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [chapterId, enabled, reloadToken]);

  const reload = React.useCallback(
    () => setReloadToken((token) => token + 1),
    [],
  );
  // Never show another chapter's answer while the new one loads.
  const current =
    state.chapterId === chapterId ? state : initialState(chapterId);
  return {
    status: current.status,
    records: current.records,
    refreshFailed: current.refreshFailed,
    reload,
  };
}

function initialState(chapterId: string): LoadedState {
  return { chapterId, status: "loading", records: [], refreshFailed: false };
}
