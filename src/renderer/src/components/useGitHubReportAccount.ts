import React from "react";
import type {
  GitHubReportAuthAction,
  GitHubReportAuthState,
} from "../../../shared/githubReport";
import { errorReportGateway } from "../lib/errorReportGateway";

type GitHubReportAccountPhase =
  "checking" | "unconfigured" | "signedOut" | "pending" | "connected";

function getGitHubReportAccountPhase({
  account,
  failed,
}: {
  account: GitHubReportAuthState | null;
  failed: boolean;
}): GitHubReportAccountPhase {
  if (!account) return failed ? "signedOut" : "checking";
  if (!account.configured) return "unconfigured";
  if (account.login) return "connected";
  return account.userCode ? "pending" : "signedOut";
}

export function useGitHubReportAccount() {
  const [account, setAccount] = React.useState<GitHubReportAuthState | null>(
    null,
  );
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const generation = React.useRef(0);
  React.useEffect(() => {
    const requestGeneration = generation;
    let active = true;
    void errorReportGateway
      .githubReportAccount("status")
      .then((value) => {
        if (active) setAccount(value);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      requestGeneration.current++;
    };
  }, []);

  React.useEffect(() => {
    if (!account?.userCode) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await errorReportGateway.githubReportAccount("poll");
        if (active) {
          setAccount(next);
          timer = setTimeout(() => {
            void poll();
          }, 1000);
        }
      } catch (error) {
        console.error(error);
        if (active) {
          setFailed(true);
          setAccount({ configured: true });
        }
      }
    };
    timer = setTimeout(() => {
      void poll();
    }, 1000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [account?.userCode]);

  const act = async (action: GitHubReportAuthAction) => {
    const current = ++generation.current;
    setBusy(true);
    setFailed(false);
    try {
      const next = await errorReportGateway.githubReportAccount(action);
      if (generation.current === current) setAccount(next);
    } catch (error) {
      console.error(error);
      if (generation.current === current) setFailed(true);
    } finally {
      if (generation.current === current) setBusy(false);
    }
  };
  return {
    account,
    busy,
    failed,
    phase: getGitHubReportAccountPhase({ account, failed }),
    act,
  };
}
