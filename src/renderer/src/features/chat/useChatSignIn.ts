import React from "react";
import { claudeConnection } from "../../api/claudeConnection";
import { claudeGateway } from "../../api/claudeGateway";
import { codexConnection } from "../../api/codexConnection";
import { grokConnection } from "../../api/grokConnection";
import { grokGateway } from "../../api/grokGateway";
import { settingsGateway } from "../../api/settingsGateway";
import { useAccountAuthOperation } from "../../hooks/useAccountAuthOperation";
import { resolveAccountConnectStage } from "../../lib/accountRuntimePresentation";
import type { useChat } from "./useChat";
import type { useChatModel } from "./useChatModel";

type Runtime = ReturnType<typeof useChatModel>["runtime"];

/**
 * Chat's sign-in for the selected assistant. The first sign-in downloads the
 * official CLI once; progress and cancel are the shared app operation.
 */
export function useChatSignIn(
  chat: ReturnType<typeof useChat>,
  model: ReturnType<typeof useChatModel>,
) {
  const runtime = model.runtime;
  const operation = useAccountAuthOperation(`${runtime}-auth`);
  const [pending, setPending] = React.useState<Runtime | null>(null);
  const [failed, setFailed] = React.useState<Runtime | null>(null);
  const stage = resolveAccountConnectStage({
    runtimeMissing: model.runtimeMissing,
    activity: operation.activity,
    pending: pending === runtime,
    failed: failed === runtime && !operation.cancelled,
  });
  const login = () =>
    void chat.perform(async () => {
      setPending(runtime);
      setFailed(null);
      try {
        await signIn(runtime);
      } catch (failure) {
        setFailed(runtime);
        await rereadAccount(runtime);
        throw failure;
      } finally {
        setPending(null);
      }
    });
  return {
    runtime,
    stage,
    activity: operation.activity,
    cancel: operation.cancel,
    login,
  };
}

async function signIn(runtime: Runtime): Promise<void> {
  if (runtime === "claude")
    claudeConnection.publish(await claudeGateway.loginClaudeAccount());
  else if (runtime === "grok")
    grokConnection.publish(await grokGateway.loginGrokAccount());
  else codexConnection.publish(await settingsGateway.loginCodexAccount());
}

const CONNECTIONS = {
  claude: claudeConnection,
  codex: codexConnection,
  grok: grokConnection,
} as const satisfies Record<Runtime, { refresh: () => Promise<unknown> }>;

/** A failed first sign-in may still have installed the CLI. */
async function rereadAccount(runtime: Runtime): Promise<void> {
  try {
    await CONNECTIONS[runtime].refresh();
  } catch (error) {
    console.warn("Could not re-read the chat account", error);
  }
}
