import React from "react";
import { codexConnection } from "../../api/codexConnection";
import { useTranslation } from "react-i18next";
import type { CodexAccountSnapshot } from "../../../../shared/codexAccountTypes";
import { settingsGateway } from "../../api/settingsGateway";
import { formatSettingsErrorMessage } from "../settingsModalHelpers";
import { useAccountAuthOperation } from "../../hooks/useAccountAuthOperation";
import {
  type AccountConnectStage,
  isAccountRuntimeMissing,
  resolveAccountConnectStage,
} from "../../lib/accountRuntimePresentation";
import { Button } from "../ui/Button";
import { AccountRuntimeSetup } from "./AccountRuntimeSetup";

type AccountAction = "login" | "logout";

const CATALOG_REFRESH_INTERVAL_MS = 5 * 60_000;

type AccountRefreshState = { lastReadAt: number | null; revision: number };

type CodexAccountController = {
  snapshot: CodexAccountSnapshot | null;
  loading: boolean;
  action: AccountAction | null;
  error: string | null;
  failedAction: AccountAction | null;
  runAction: (action: AccountAction) => Promise<void>;
};

export function CodexAccountField({
  controlsBusy,
  onSnapshotChange,
}: {
  controlsBusy: boolean;
  onSnapshotChange?: (snapshot: CodexAccountSnapshot | null) => void;
}): React.JSX.Element {
  const operation = useAccountAuthOperation("codex-auth");
  const controller = useCodexAccountController(controlsBusy, onSnapshotChange);
  const authenticated = controller.snapshot?.authenticated === true;
  const runtimeMissing = isAccountRuntimeMissing(controller.snapshot);
  const { loginError, otherError } = readAccountFailure(
    controller,
    operation.cancelled,
  );
  const disabled =
    controlsBusy ||
    controller.loading ||
    controller.action !== null ||
    operation.activity !== null;
  return (
    <section
      className="codex-account-card"
      aria-labelledby="codex-account-title"
    >
      <CodexAccountSummary
        snapshot={controller.snapshot}
        loading={controller.loading}
      />
      <CodexAccountActionButton
        authenticated={authenticated}
        action={controller.action}
        stage={resolveAccountConnectStage({
          runtimeMissing,
          activity: operation.activity,
          pending: controller.action === "login",
          failed: loginError !== null,
        })}
        disabled={disabled}
        runAction={controller.runAction}
      />
      <AccountRuntimeSetup
        runtime="codex"
        runtimeMissing={runtimeMissing}
        activity={operation.activity}
        signInError={loginError}
        onCancel={operation.cancel}
      />
      {otherError ? (
        <p className="codex-account-error" role="alert">
          {otherError}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Sign-in failures get the retryable first-use message; a cancelled sign-in
 * also rejects but is the user's choice. Other errors keep the plain alert.
 */
function readAccountFailure(
  controller: CodexAccountController,
  cancelled: boolean,
): { loginError: string | null; otherError: string | null } {
  const login = controller.failedAction === "login";
  return {
    loginError: login && !cancelled ? controller.error : null,
    otherError:
      (login ? null : controller.error) ||
      controller.snapshot?.authenticationError ||
      null,
  };
}

function CodexAccountSummary({
  snapshot,
  loading,
}: {
  snapshot: CodexAccountSnapshot | null;
  loading: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const authenticated = snapshot?.authenticated === true;
  const status = readAccountStatus(snapshot, loading, {
    loading: t("settings.codex.account.loading"),
    connected: t("settings.codex.account.connected"),
    signedOut: t("settings.codex.account.signedOut"),
  });
  return (
    <div className="codex-account-summary">
      <span
        className={`codex-account-indicator ${authenticated ? "connected" : ""}`}
        aria-hidden="true"
      />
      <div>
        <strong id="codex-account-title">
          {t("settings.codex.account.title")}
        </strong>
        <p aria-live="polite">{status}</p>
        {authenticated && snapshot.planType ? (
          <small>
            {t("settings.codex.account.plan", { plan: snapshot.planType })}
          </small>
        ) : null}
      </div>
    </div>
  );
}

const LOGIN_LABELS: Record<AccountConnectStage, string> = {
  connect: "settings.codex.account.signIn",
  download: "settings.accountRuntime.codexLogin",
  "retry-download": "settings.accountRuntime.codexLoginRetry",
  downloading: "settings.accountRuntime.downloading",
  "signing-in": "settings.codex.account.signingIn",
};

function CodexAccountActionButton({
  authenticated,
  action,
  stage,
  disabled,
  runAction,
}: {
  authenticated: boolean;
  action: AccountAction | null;
  stage: AccountConnectStage;
  disabled: boolean;
  runAction: (action: AccountAction) => Promise<void>;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const nextAction = authenticated ? "logout" : "login";
  return (
    <Button
      variant="secondary"
      disabled={disabled}
      onClick={() => void runAction(nextAction)}
    >
      {action === "logout"
        ? t("settings.codex.account.signingOut")
        : authenticated
          ? t("settings.codex.account.signOut")
          : t(LOGIN_LABELS[stage])}
    </Button>
  );
}

function useCodexAccountController(
  controlsBusy: boolean,
  onSnapshotChange?: (snapshot: CodexAccountSnapshot | null) => void,
): CodexAccountController {
  const { t } = useTranslation("components");
  const [snapshot, setSnapshot] = React.useState<CodexAccountSnapshot | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [action, setAction] = React.useState<AccountAction | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [failedAction, setFailedAction] = React.useState<AccountAction | null>(
    null,
  );
  const refreshState = React.useRef<AccountRefreshState>({
    lastReadAt: null,
    revision: 0,
  });
  const publishSnapshot = React.useCallback(
    (next: CodexAccountSnapshot) => {
      refreshState.current.lastReadAt = Date.now();
      codexConnection.publish(next);
      setSnapshot(next);
      onSnapshotChange?.(next);
    },
    [onSnapshotChange],
  );

  useCodexAccountRefresh(
    controlsBusy || action !== null,
    refreshState,
    publishSnapshot,
    setLoading,
    setError,
  );

  const runAction = React.useCallback(
    async (nextAction: AccountAction) => {
      refreshState.current.revision += 1;
      setAction(nextAction);
      setError(null);
      setFailedAction(null);
      try {
        publishSnapshot(await performAccountAction(nextAction));
      } catch (caught) {
        setFailedAction(nextAction);
        setError(
          formatSettingsErrorMessage(
            caught,
            t(accountActionFailureKey(nextAction)),
          ),
        );
        // A failed first sign-in may still have installed the CLI.
        if (nextAction === "login") await rereadAccount(publishSnapshot);
      } finally {
        setAction(null);
      }
    },
    [publishSnapshot, t],
  );
  return { snapshot, loading, action, error, failedAction, runAction };
}

function useCodexAccountRefresh(
  paused: boolean,
  refreshState: React.RefObject<AccountRefreshState>,
  publishSnapshot: (snapshot: CodexAccountSnapshot) => void,
  setLoading: React.Dispatch<React.SetStateAction<boolean>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
): void {
  const { t } = useTranslation("components");
  React.useEffect(() => {
    if (paused) return;
    let active = true;
    let inFlight = false;
    const refresh = () => {
      if (!active || inFlight || document.hidden) return;
      inFlight = true;
      const revision = refreshState.current.revision;
      void settingsGateway
        .getCodexAccount()
        .then((next) => {
          if (!active || revision !== refreshState.current.revision) return;
          setError(null);
          publishSnapshot(next);
        })
        .catch((caught: unknown) => {
          if (!active || revision !== refreshState.current.revision) return;
          setError(
            formatSettingsErrorMessage(
              caught,
              t("settings.codex.account.loadFailed"),
            ),
          );
        })
        .finally(() => {
          inFlight = false;
          if (!active || revision !== refreshState.current.revision) return;
          refreshState.current.lastReadAt = Date.now();
          setLoading(false);
        });
    };
    const refreshWhenStale = () => {
      const lastReadAt = refreshState.current.lastReadAt;
      if (
        lastReadAt === null ||
        Date.now() - lastReadAt >= CATALOG_REFRESH_INTERVAL_MS
      )
        refresh();
    };
    refreshWhenStale();
    const timer = window.setInterval(refresh, CATALOG_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshWhenStale);
    document.addEventListener("visibilitychange", refreshWhenStale);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenStale);
      document.removeEventListener("visibilitychange", refreshWhenStale);
    };
  }, [paused, refreshState, publishSnapshot, setError, setLoading, t]);
}

async function rereadAccount(
  publishSnapshot: (snapshot: CodexAccountSnapshot) => void,
): Promise<void> {
  try {
    publishSnapshot(await settingsGateway.getCodexAccount());
  } catch (error) {
    console.warn("Could not re-read the Codex account", error);
  }
}

async function performAccountAction(
  action: AccountAction,
): Promise<CodexAccountSnapshot> {
  return action === "login"
    ? settingsGateway.loginCodexAccount()
    : settingsGateway.logoutCodexAccount();
}

function accountActionFailureKey(action: AccountAction): string {
  return action === "login"
    ? "settings.codex.account.loginFailed"
    : "settings.codex.account.logoutFailed";
}

function readAccountStatus(
  snapshot: CodexAccountSnapshot | null,
  loading: boolean,
  labels: { loading: string; connected: string; signedOut: string },
): string {
  if (loading) return labels.loading;
  if (!snapshot?.authenticated) return labels.signedOut;
  return snapshot.email || labels.connected;
}
