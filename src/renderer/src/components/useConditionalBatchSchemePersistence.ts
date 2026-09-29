import React from "react";
import { formatConditionalBatchValidationIssue } from "../../../shared/conditionalBatchErrorPresentation";
import {
  ConditionalBatchSchemeDraftV2Schema,
  type ConditionalBatchSchemeDraftV2,
  type ConditionalBatchSnapshotV2,
} from "../../../shared/conditionalBatchRules";
import { conditionalBatchGateway } from "../api/conditionalBatchGateway";
import {
  ConditionalBatchStorageState,
  readErrorMessage,
  stableDraftString,
} from "./conditionalBatchSchemeDrafts";
type PersistenceOptions = {
  draft: ConditionalBatchSchemeDraftV2;
  selectedSchemeId: string;
  onSaved: (savedId: string, stored: boolean) => void;
};
type PersistenceContext = ReturnType<typeof useSchemePersistenceState> &
  PersistenceOptions;
export function useConditionalBatchSchemePersistence(
  options: PersistenceOptions,
) {
  const values = useSchemePersistenceState(options);
  const state = { ...values, ...options };
  useLoadSchemeSnapshot(state);
  useDelayedSchemeAutosave(state);
  const invalidateSave = React.useCallback(() => {
    ++values.saveGenerationRef.current;
  }, [values.saveGenerationRef]);
  const acceptSavedDraft = React.useCallback(
    (value: string) => {
      values.lastSavedDraftRef.current = value;
    },
    [values.lastSavedDraftRef],
  );
  return {
    snapshot: values.snapshot,
    setSnapshot: values.setSnapshot,
    storageBusy: values.storageBusy,
    setStorageBusy: values.setStorageBusy,
    storageError: values.storageError,
    setStorageError: values.setStorageError,
    autosaveState: values.autosaveState,
    setAutosaveState: values.setAutosaveState,
    parsedDraft: values.parsedDraft,
    stored: values.stored,
    invalidateSave,
    acceptSavedDraft,
    canStartWrite: () =>
      !values.storageBusy && !values.transitionPendingRef.current,
    beginDelete: () => {
      values.setStorageBusy(true);
      values.transitionPendingRef.current = true;
      cancelAutosave(state);
      values.setStorageError(null);
    },
    finishDelete: () => {
      values.transitionPendingRef.current = false;
      values.setStorageBusy(false);
    },
    saveScheme: () => saveScheme(state),
    runWithSavedDraft: (action: () => void | Promise<void>) =>
      runWithSavedDraft(state, action),
  };
}
function useSchemePersistenceState({
  draft,
  selectedSchemeId,
}: PersistenceOptions) {
  const [snapshot, setSnapshot] =
    React.useState<ConditionalBatchSnapshotV2 | null>(null);
  const [storageBusy, setStorageBusy] = React.useState(false);
  const [storageError, setStorageError] = React.useState<string | null>(null);
  const [autosaveState, setAutosaveState] =
    React.useState<ConditionalBatchStorageState["autosaveState"]>("idle");
  const lastSavedDraftRef = React.useRef("");
  const saveGenerationRef = React.useRef(0);
  const autosaveTimerRef = React.useRef<number | null>(null);
  const transitionPendingRef = React.useRef(false);
  const parsedDraft = React.useMemo(
    () => ConditionalBatchSchemeDraftV2Schema.safeParse(draft),
    [draft],
  );
  const stored = Boolean(
    snapshot?.schemes.some((scheme) => scheme.id === selectedSchemeId),
  );
  const serializedDraft = parsedDraft.success
    ? stableDraftString(parsedDraft.data)
    : "";
  return {
    snapshot,
    storageBusy,
    storageError,
    autosaveState,
    lastSavedDraftRef,
    saveGenerationRef,
    autosaveTimerRef,
    transitionPendingRef,
    setSnapshot,
    setStorageBusy,
    setStorageError,
    setAutosaveState,
    parsedDraft,
    stored,
    serializedDraft,
  };
}
function useLoadSchemeSnapshot({
  setSnapshot,
  setStorageError,
  setStorageBusy,
}: PersistenceContext) {
  React.useEffect(() => {
    let active = true;
    setStorageBusy(true);
    conditionalBatchGateway
      .listConditionalBatchSchemes()
      .then((loaded) => {
        if (!active) return;
        setSnapshot(loaded);
        setStorageError(null);
      })
      .catch((error: unknown) => {
        if (active) setStorageError(readErrorMessage(error));
      })
      .finally(() => {
        if (active) setStorageBusy(false);
      });
    return () => {
      active = false;
    };
  }, [setSnapshot, setStorageError, setStorageBusy]);
}
function useDelayedSchemeAutosave({
  stored,
  parsedDraft,
  serializedDraft,
  lastSavedDraftRef,
  setAutosaveState,
  saveGenerationRef,
  autosaveTimerRef,
  selectedSchemeId,
  setSnapshot,
  setStorageError,
}: PersistenceContext) {
  React.useEffect(() => {
    if (
      !stored ||
      !parsedDraft.success ||
      serializedDraft === lastSavedDraftRef.current
    ) {
      return;
    }
    setAutosaveState("waiting");
    const generation = ++saveGenerationRef.current;
    const timer = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      setAutosaveState("saving");
      void conditionalBatchGateway
        .saveConditionalBatchScheme({
          id: selectedSchemeId,
          scheme: parsedDraft.data,
        })
        .then((next) => {
          if (generation !== saveGenerationRef.current) return;
          setSnapshot(next);
          lastSavedDraftRef.current = serializedDraft;
          setAutosaveState("saved");
          setStorageError(null);
        })
        .catch((error: unknown) => {
          if (generation !== saveGenerationRef.current) return;
          setAutosaveState("error");
          setStorageError(readErrorMessage(error));
        });
    }, 600);
    autosaveTimerRef.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (autosaveTimerRef.current === timer) autosaveTimerRef.current = null;
    };
  }, [
    parsedDraft,
    selectedSchemeId,
    serializedDraft,
    stored,
    lastSavedDraftRef,
    saveGenerationRef,
    autosaveTimerRef,
    setSnapshot,
    setAutosaveState,
    setStorageError,
  ]);
}

function cancelAutosave(state: PersistenceContext): void {
  const { autosaveTimerRef, saveGenerationRef } = state;
  if (autosaveTimerRef.current !== null) {
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }
  ++saveGenerationRef.current;
}

async function saveScheme(state: PersistenceContext): Promise<void> {
  const {
    parsedDraft,
    storageBusy,
    transitionPendingRef,
    setStorageBusy,
    setStorageError,
    setAutosaveState,
    saveGenerationRef,
    stored,
    selectedSchemeId,
    setSnapshot,
    lastSavedDraftRef,
    serializedDraft,
  } = state;
  if (!parsedDraft.success || storageBusy || transitionPendingRef.current)
    return;
  transitionPendingRef.current = true;
  cancelAutosave(state);
  setStorageBusy(true);
  setStorageError(null);
  setAutosaveState("saving");
  const generation = ++saveGenerationRef.current;
  try {
    const existingId = stored ? selectedSchemeId : undefined;
    const next = await conditionalBatchGateway.saveConditionalBatchScheme({
      id: existingId,
      scheme: parsedDraft.data,
    });
    if (generation !== saveGenerationRef.current) return;
    setSnapshot(next);
    const savedId = existingId ?? next.schemes[0]?.id;
    if (savedId) state.onSaved(savedId, stored);
    lastSavedDraftRef.current = serializedDraft;
    setAutosaveState("saved");
  } catch (error) {
    if (generation !== saveGenerationRef.current) return;
    setAutosaveState("error");
    setStorageError(readErrorMessage(error));
  } finally {
    transitionPendingRef.current = false;
    setStorageBusy(false);
  }
}

async function flushStoredDraft(state: PersistenceContext): Promise<boolean> {
  const {
    stored,
    parsedDraft,
    setStorageError,
    serializedDraft,
    lastSavedDraftRef,
    autosaveState,
    saveGenerationRef,
    setAutosaveState,
    selectedSchemeId,
    setSnapshot,
  } = state;
  cancelAutosave(state);
  if (!stored) return true;
  if (!parsedDraft.success) {
    setStorageError(
      formatConditionalBatchValidationIssue(parsedDraft.error.issues[0]) ??
        "규칙을 확인하세요.",
    );
    return false;
  }
  if (
    serializedDraft === lastSavedDraftRef.current &&
    (autosaveState === "idle" || autosaveState === "saved")
  )
    return true;
  const generation = ++saveGenerationRef.current;
  setAutosaveState("saving");
  try {
    const next = await conditionalBatchGateway.saveConditionalBatchScheme({
      id: selectedSchemeId,
      scheme: parsedDraft.data,
    });
    if (generation !== saveGenerationRef.current) return false;
    setSnapshot(next);
    lastSavedDraftRef.current = serializedDraft;
    setAutosaveState("saved");
    setStorageError(null);
    return true;
  } catch (error) {
    if (generation !== saveGenerationRef.current) return false;
    setAutosaveState("error");
    setStorageError(readErrorMessage(error));
    return false;
  }
}

async function runWithSavedDraft(
  state: PersistenceContext,
  action: () => void | Promise<void>,
): Promise<boolean> {
  const {
    storageBusy,
    transitionPendingRef,
    setStorageBusy,
    stored,
    parsedDraft,
    serializedDraft,
    lastSavedDraftRef,
    autosaveState,
    setStorageError,
  } = state;
  if (storageBusy || transitionPendingRef.current) return false;
  transitionPendingRef.current = true;
  setStorageBusy(true);
  try {
    const needsFlush =
      stored &&
      (!parsedDraft.success ||
        serializedDraft !== lastSavedDraftRef.current ||
        (autosaveState !== "idle" && autosaveState !== "saved"));
    if (needsFlush && !(await flushStoredDraft(state))) return false;
    const pending = action();
    if (pending) await pending;
    return true;
  } catch (error) {
    setStorageError(readErrorMessage(error));
    return false;
  } finally {
    transitionPendingRef.current = false;
    setStorageBusy(false);
  }
}
