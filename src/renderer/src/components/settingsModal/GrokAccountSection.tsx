import React from "react";
import { useTranslation } from "react-i18next";
import type { GrokAccount } from "../../../../shared/grokTypes";
import { grokConnection } from "../../api/grokConnection";
import { grokGateway } from "../../api/grokGateway";
import type { AccountConnectStage } from "../../lib/accountRuntimePresentation";
import { Button } from "../ui/Button";
import { AccountRuntimeSetup } from "./AccountRuntimeSetup";
import { useCliAccountActions } from "./useCliAccountActions";
import styles from "./McpSettingsPanel.module.css";

const LOGIN_LABELS: Record<AccountConnectStage, string> = {
  connect: "settings.grok.login",
  download: "settings.accountRuntime.grokLogin",
  "retry-download": "settings.accountRuntime.grokLoginRetry",
  downloading: "settings.accountRuntime.downloading",
  "signing-in": "settings.codex.account.signingIn",
};

/**
 * Grok account for the in-app chat assistant. Grok Build owns sign-in and
 * credentials; account management is opened from the chat provider.
 */
export function GrokAccountSection(): React.JSX.Element {
  const { t } = useTranslation("components");
  const controller = useCliAccountActions<GrokAccount, "login">({
    connection: grokConnection,
    kind: "grok-auth",
    primaryMethod: "login",
    login: () => grokGateway.loginGrokAccount(),
    logout: () => grokGateway.logoutGrokAccount(),
    fallbackError: t("settings.grok.error"),
  });
  const { account, operation } = controller;
  const authenticated = account?.authenticated === true;
  return (
    <section aria-label={t("settings.grok.title")} className={styles.body}>
      <p
        className={styles.status}
        data-state={authenticated ? "online" : undefined}
        role="status"
      >
        <span className={styles.dot} aria-hidden="true" />
        {readStatus(account, t)}
      </p>
      <div className="settings-inline-actions">
        <Button
          variant="secondary"
          disabled={controller.busy}
          onClick={() =>
            void controller.run(authenticated ? "logout" : "login")
          }
        >
          {authenticated
            ? t("settings.grok.logout")
            : t(LOGIN_LABELS[controller.stage("login")])}
        </Button>
        <Button
          variant="ghost"
          disabled={controller.busy}
          onClick={() => void controller.run("refresh")}
        >
          {t("settings.grok.refresh")}
        </Button>
      </div>
      <AccountRuntimeSetup
        runtime="grok"
        runtimeMissing={controller.runtimeMissing}
        activity={operation.activity}
        signInError={controller.signInError}
        onCancel={operation.cancel}
      />
      {controller.otherError && (
        <p className={styles.error} role="alert">
          {controller.otherError}
        </p>
      )}
    </section>
  );
}

function readStatus(
  account: GrokAccount | null,
  t: ReturnType<typeof useTranslation<"components">>["t"],
): string {
  if (!account) return t("settings.grok.checking");
  if (!account.authenticated) return t("settings.grok.signedOut");
  return account.version
    ? t("settings.grok.connectedVersion", { version: account.version })
    : t("settings.grok.connected");
}
