import { randomUUID } from "node:crypto";
import { grokIpcContracts } from "../../shared/ipcGrokContracts";
import { authenticateGrok, readGrokAccount } from "../grok/grokAccount";
import { runManagedAppOperation } from "../appOperationRegistry";
import type { IpcContext } from "./context";
import { trustedHandleContract } from "./trustedIpc";
import { cliAccountProgress } from "./cliAccountProgress";

export function registerGrokAccountIpc(
  context: IpcContext,
  runtime = { readGrokAccount, authenticateGrok },
) {
  trustedHandleContract(context, grokIpcContracts.getGrokAccount, () =>
    runtime.readGrokAccount(context.appPaths),
  );
  const authenticate = (action: "login" | "logout") =>
    runManagedAppOperation(
      context.operations,
      {
        id: `grok-auth-${randomUUID()}`,
        kind: "grok-auth",
        mutatesLibrary: false,
        resources: [{ kind: "grok-auth", scope: "*", access: "write" }],
        presentation: { phase: "waiting-for-user", cancellable: true },
      },
      (signal, lease) =>
        runtime.authenticateGrok(
          context.appPaths,
          action,
          signal,
          ...cliAccountProgress(lease, action !== "logout"),
        ),
    );
  trustedHandleContract(context, grokIpcContracts.loginGrokAccount, () =>
    authenticate("login"),
  );
  trustedHandleContract(context, grokIpcContracts.logoutGrokAccount, () =>
    authenticate("logout"),
  );
}
