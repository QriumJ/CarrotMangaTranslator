import React from "react";
import {
  readWorkspacePreference,
  writeWorkspacePreference,
  type WorkspacePreferenceKey,
  type WorkspacePreferences,
} from "../lib/workspacePreferences";

type PreferenceState<Key extends WorkspacePreferenceKey> = readonly [
  WorkspacePreferences[Key],
  React.Dispatch<React.SetStateAction<WorkspacePreferences[Key]>>,
  /** Persists a pending change now, e.g. when a slider is released. */
  () => void,
];

/**
 * React state backed by one stored workspace preference. Updates render
 * immediately; storage is written once the value settles (`commitDelayMs`)
 * or when `commit` runs, and any pending value is flushed on unmount/pagehide.
 */
export function useWorkspacePreference<Key extends WorkspacePreferenceKey>(
  key: Key,
  { commitDelayMs = 0 }: { commitDelayMs?: number } = {},
): PreferenceState<Key> {
  const [value, setValue] = React.useState<WorkspacePreferences[Key]>(() =>
    readWorkspacePreference(key),
  );
  const committedRef = React.useRef(value);
  const pendingRef = React.useRef<{ value: WorkspacePreferences[Key] } | null>(
    null,
  );
  const timerRef = React.useRef<number | null>(null);
  const commit = React.useCallback(() => {
    clearTimer(timerRef);
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    committedRef.current = pending.value;
    writeWorkspacePreference(key, pending.value);
  }, [key]);

  React.useEffect(() => {
    clearTimer(timerRef);
    if (Object.is(value, committedRef.current)) {
      pendingRef.current = null;
      return;
    }
    pendingRef.current = { value };
    if (commitDelayMs <= 0) commit();
    else timerRef.current = window.setTimeout(commit, commitDelayMs);
  }, [commit, commitDelayMs, value]);

  React.useEffect(() => {
    window.addEventListener("pagehide", commit);
    return () => {
      window.removeEventListener("pagehide", commit);
      commit();
    };
  }, [commit]);

  return [value, setValue, commit] as const;
}

function clearTimer(timerRef: React.RefObject<number | null>): void {
  if (timerRef.current === null) return;
  window.clearTimeout(timerRef.current);
  timerRef.current = null;
}
