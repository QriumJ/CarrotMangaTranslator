import React from "react";
import { useTranslation } from "react-i18next";
import type {
  AppOperationActivityEvent,
  AppOperationKind,
} from "../../../shared/appOperationTypes";
import { appGateway } from "../api/appGateway";
import { isAppOperationActive } from "../lib/appOperationPresentation";
import { toastNotificationPort } from "../lib/notificationPort";
import { subscribeOperations } from "./useAppOperationActivity";

export type AccountAuthOperationKind = Extract<
  AppOperationKind,
  "claude-auth" | "codex-auth" | "grok-auth"
>;

/**
 * The running sign-in of one account, including the first-use CLI download.
 * The status dock shows the same operation; both cancel through the app
 * operation gateway.
 */
export function useAccountAuthOperation(kind: AccountAuthOperationKind) {
  const { t } = useTranslation("renderer");
  // Every auth kind is tracked, so a provider switch neither shows the other's
  // sign-in nor misses one that finished while it was not displayed.
  const [latest, setLatest] = React.useState<
    Partial<Record<AccountAuthOperationKind, AppOperationActivityEvent>>
  >({});
  React.useEffect(() => {
    let disposed = false;
    const apply = (event: AppOperationActivityEvent): void => {
      if (disposed || !isAccountAuthKind(event.kind)) return;
      const eventKind = event.kind;
      setLatest((current) => {
        const previous = current[eventKind];
        return previous && isOlder(event, previous)
          ? current
          : { ...current, [eventKind]: event };
      });
    };
    const unsubscribe = subscribeOperations(apply);
    // A missing bridge throws synchronously; it is reported like a failed read.
    void (async () => appGateway.getActiveAppOperations())()
      .then((events) => events.forEach(apply))
      .catch((error: unknown) =>
        console.warn("Could not hydrate account sign-in", error),
      );
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);
  const activity = latest[kind] ?? null;
  const running = isAppOperationActive(activity) ? activity : null;
  const cancel = React.useCallback(() => {
    if (!running?.cancellable || running.status === "cancelling") return;
    void appGateway.cancelAppOperation(running.id).catch((error: unknown) => {
      console.error("Could not cancel account sign-in", error);
      toastNotificationPort.error(t("statusDock.operation.cancelFailed"));
    });
  }, [running, t]);
  return {
    activity: running,
    /** A cancelled sign-in rejects too; it is the user's choice, not a failure. */
    cancelled: activity?.status === "cancelled",
    cancel,
  };
}

function isAccountAuthKind(
  kind: AppOperationKind,
): kind is AccountAuthOperationKind {
  return (
    kind === "claude-auth" || kind === "codex-auth" || kind === "grok-auth"
  );
}

/**
 * A late hydration snapshot or an earlier attempt's terminal event must not
 * replace a newer sign-in; attempts are ordered by start, then by update.
 */
function isOlder(
  event: AppOperationActivityEvent,
  current: AppOperationActivityEvent,
): boolean {
  if (event.startedAt !== current.startedAt)
    return event.startedAt < current.startedAt;
  return event.updatedAt < current.updatedAt;
}
