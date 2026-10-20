import type { AppOperationActivityEvent } from "../../../shared/appOperationTypes";

/**
 * Where an account connection stands before the AI CLI is ready.
 * `runtimeInstalled` is absent on installations older than on-demand download.
 */
export type AccountConnectStage =
  "connect" | "download" | "retry-download" | "downloading" | "signing-in";

/** Official CLI each account signs in through; also the downloaded runtime. */
export const ACCOUNT_CLI_NAMES = {
  claude: "Claude Code",
  codex: "Codex",
  grok: "Grok Build",
} as const;

export type AccountCliRuntime = keyof typeof ACCOUNT_CLI_NAMES;

export function isAccountRuntimeMissing(
  account: { runtimeInstalled?: boolean } | null | undefined,
): boolean {
  return account?.runtimeInstalled === false;
}

export function resolveAccountConnectStage(input: {
  runtimeMissing: boolean;
  activity: Pick<AppOperationActivityEvent, "phase"> | null;
  /** This control's sign-in was requested; its first progress may not be here yet. */
  pending: boolean;
  failed: boolean;
}): AccountConnectStage {
  if (input.activity)
    return input.activity.phase === "cli-downloading"
      ? "downloading"
      : "signing-in";
  if (input.pending) return input.runtimeMissing ? "downloading" : "signing-in";
  if (!input.runtimeMissing) return "connect";
  return input.failed ? "retry-download" : "download";
}
