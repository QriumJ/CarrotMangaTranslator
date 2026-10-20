import React from "react";
import { useTranslation } from "react-i18next";
import type { AppOperationActivityEvent } from "../../../../shared/appOperationTypes";
import {
  ACCOUNT_CLI_NAMES,
  type AccountConnectStage,
} from "../../lib/accountRuntimePresentation";
import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import {
  formatAppOperationActivity,
  formatAppOperationProgress,
  resolveAppOperationProgress,
} from "../../lib/appOperationPresentation";
import type { useChat } from "./useChat";
import type { useChatModel } from "./useChatModel";
import type { ChatRuntime } from "./chatRuntimes";
import { useChatSignIn } from "./useChatSignIn";
import styles from "./ChatPanel.module.css";

const LOGIN_LABELS = {
  claude: {
    connect: "chat.claudeLogin",
    download: "chat.claudeDownloadLogin",
    "retry-download": "chat.claudeDownloadLoginRetry",
    downloading: "settings.accountRuntime.downloading",
    "signing-in": "settings.codex.account.signingIn",
  },
  codex: {
    connect: "chat.login",
    download: "chat.downloadLogin",
    "retry-download": "chat.downloadLoginRetry",
    downloading: "settings.accountRuntime.downloading",
    "signing-in": "settings.codex.account.signingIn",
  },
  grok: {
    connect: "chat.grokLogin",
    download: "chat.grokDownloadLogin",
    "retry-download": "chat.grokDownloadLoginRetry",
    downloading: "settings.accountRuntime.downloading",
    "signing-in": "settings.codex.account.signingIn",
  },
} as const satisfies Record<ChatRuntime, Record<AccountConnectStage, string>>;

const LOGIN_HINTS = {
  claude: "chat.claudeLoginHint",
  codex: "chat.loginHint",
  grok: "chat.grokLoginHint",
} as const satisfies Record<ChatRuntime, string>;

/** Sign-in prompt; the first sign-in downloads the official CLI once. */
export function ChatLogin({
  chat,
  model,
}: {
  chat: ReturnType<typeof useChat>;
  model: ReturnType<typeof useChatModel>;
}) {
  const { t } = useTranslation("components");
  const signIn = useChatSignIn(chat, model);
  const { runtime } = signIn;
  return (
    <div className={styles.login}>
      <p>
        {model.runtimeMissing
          ? t("settings.accountRuntime.missingDetail", {
              name: ACCOUNT_CLI_NAMES[runtime],
            })
          : t(LOGIN_HINTS[runtime])}
      </p>
      <Button
        onClick={signIn.login}
        disabled={chat.busy || signIn.activity !== null}
      >
        {t(LOGIN_LABELS[runtime][signIn.stage])}
      </Button>
      {signIn.activity ? (
        <ChatLoginProgress
          activity={signIn.activity}
          onCancel={signIn.cancel}
        />
      ) : null}
    </div>
  );
}

/** The same sign-in operation the status dock shows, with its cancel. */
function ChatLoginProgress({
  activity,
  onCancel,
}: {
  activity: AppOperationActivityEvent;
  onCancel: () => void;
}) {
  const { i18n, t } = useTranslation("components");
  const { t: rendererT } = useTranslation("renderer");
  const progress = resolveAppOperationProgress(activity);
  const valueText = progress
    ? formatAppOperationProgress(
        activity,
        progress,
        i18n.resolvedLanguage ?? i18n.language,
        (value) => t("statusDock.operation.percent", { value }),
      )
    : t("common.inProgress");
  const cancelling = activity.status === "cancelling";
  return (
    <div className={styles.loginProgress}>
      <span role="status">
        {formatAppOperationActivity(activity, rendererT)}
      </span>
      <ProgressBar
        label={t("statusDock.operation.progressLabel")}
        mode={progress ? "determinate" : "indeterminate"}
        value={progress?.current}
        max={progress?.total}
        valueText={valueText}
      />
      {progress ? <small>{valueText}</small> : null}
      {activity.cancellable || cancelling ? (
        <Button
          variant="danger"
          size="sm"
          disabled={cancelling}
          onClick={onCancel}
        >
          {t(cancelling ? "statusDock.cancelling" : "statusDock.cancelJob")}
        </Button>
      ) : null}
    </div>
  );
}
