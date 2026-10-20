import React from "react";
import type { createAccountConnection } from "../../api/accountConnection";
import {
  type AccountAuthOperationKind,
  useAccountAuthOperation,
} from "../../hooks/useAccountAuthOperation";
import { useAccountConnection } from "../../hooks/useAccountConnection";
import {
  isAccountRuntimeMissing,
  resolveAccountConnectStage,
} from "../../lib/accountRuntimePresentation";

type CliAccount = { authenticated: boolean; runtimeInstalled?: boolean };
export type CliAccountAction<Method extends string> =
  "refresh" | "logout" | Method;
type Failure<Method extends string> = {
  action: CliAccountAction<Method>;
  message: string;
};

/**
 * Settings controls for an account whose official CLI owns sign-in. Sign-in
 * methods download the CLI first when it is missing; progress and cancel are
 * the shared app operation, and a cancelled sign-in is not a failure.
 */
export function useCliAccountActions<
  Account extends CliAccount,
  Method extends string,
>(options: {
  connection: ReturnType<typeof createAccountConnection<Account>>;
  kind: AccountAuthOperationKind;
  /** Shows an operation started elsewhere, e.g. from chat. */
  primaryMethod: Method;
  login: (method: Method) => Promise<Account>;
  logout: () => Promise<Account>;
  fallbackError: string;
}) {
  const { connection } = options;
  const { account } = useAccountConnection(connection, true);
  const operation = useAccountAuthOperation(options.kind);
  const [pending, setPending] = React.useState<CliAccountAction<Method> | null>(
    null,
  );
  const [failure, setFailure] = React.useState<Failure<Method> | null>(null);
  const isLogin = (action: CliAccountAction<Method>): action is Method =>
    action !== "refresh" && action !== "logout";
  const run = async (action: CliAccountAction<Method>) => {
    setPending(action);
    setFailure(null);
    try {
      if (action === "refresh") await connection.refresh();
      else
        connection.publish(
          await (isLogin(action) ? options.login(action) : options.logout()),
        );
    } catch (caught) {
      setFailure({
        action,
        message:
          caught instanceof Error ? caught.message : options.fallbackError,
      });
      // A failed first sign-in may still have installed the CLI.
      if (isLogin(action)) await rereadAfterFailedLogin(connection);
    } finally {
      setPending(null);
    }
  };
  const shownFailure =
    failure && !(isLogin(failure.action) && operation.cancelled)
      ? failure
      : null;
  const runtimeMissing = isAccountRuntimeMissing(account);
  const stage = (method: Method) =>
    resolveAccountConnectStage({
      runtimeMissing,
      activity:
        pending === method || (!pending && method === options.primaryMethod)
          ? operation.activity
          : null,
      pending: pending === method,
      failed: shownFailure?.action === method,
    });
  const signInFailure =
    shownFailure && isLogin(shownFailure.action) ? shownFailure : null;
  return {
    account,
    operation,
    signInError: signInFailure?.message ?? null,
    otherError: signInFailure ? null : (shownFailure?.message ?? null),
    runtimeMissing,
    busy: pending !== null || operation.activity !== null,
    stage,
    run,
  };
}

async function rereadAfterFailedLogin(connection: {
  refresh: () => Promise<unknown>;
}): Promise<void> {
  try {
    await connection.refresh();
  } catch (error) {
    console.warn("Could not re-read the CLI account", error);
  }
}
