import React from "react";
import {
  normalizeExportPreferences,
  type ExportPreferences,
} from "../../../shared/exportPreferences";
import type { ManualRasterExportOptions } from "../hooks/useExportPageImagesAction";
import { useEventCallback } from "../hooks/useEventCallback";

export type PersistExportPreferences = (
  preferences: ExportPreferences,
) => Promise<boolean>;

/**
 * Every opening restores only the repeatable output choices. Existing files are
 * never overwritten by a remembered choice and text is always included.
 */
export function createInitialRasterOptions(
  saved: unknown,
): ManualRasterExportOptions {
  return { ...normalizeExportPreferences(saved), collisionPolicy: "cancel" };
}

/**
 * Hands each committed change of the safe snapshot to `persist` right away, so
 * saves leave in the order the user made them, even across a close and
 * reopen. Nothing is deferred past the modal; only the newest reply of a
 * still-open modal decides whether a failure is shown.
 */
export function useExportPreferencePersistence({
  enabled,
  options,
  persist,
}: {
  enabled: boolean;
  options: ManualRasterExportOptions;
  persist?: PersistExportPreferences;
}): { saveFailed: boolean } {
  const snapshot = enabled
    ? JSON.stringify(normalizeExportPreferences(options))
    : null;
  const [saveFailed, setSaveFailed] = React.useState(false);
  const emittedRef = React.useRef(snapshot);
  const requestRef = React.useRef(0);
  const save = useEventCallback(
    (preferences: ExportPreferences): Promise<boolean> =>
      persist ? persist(preferences) : Promise.resolve(true),
  );

  React.useEffect(() => {
    if (snapshot === null || snapshot === emittedRef.current) return;
    emittedRef.current = snapshot;
    const request = ++requestRef.current;
    void save(JSON.parse(snapshot) as ExportPreferences)
      .catch(() => false)
      .then((saved) => {
        if (request === requestRef.current) setSaveFailed(!saved);
      });
  }, [save, snapshot]);

  React.useEffect(
    () => () => {
      // Replies after closing belong to the settings owner, not this modal.
      requestRef.current += 1;
    },
    [],
  );

  return { saveFailed };
}
