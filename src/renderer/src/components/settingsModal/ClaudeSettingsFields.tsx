import React from "react";
import { useTranslation } from "react-i18next";
import type {
  ClaudeAccount,
  ClaudeEffort,
} from "../../../../shared/claudeTypes";
import { claudeConnection } from "../../api/claudeConnection";
import { claudeGateway } from "../../api/claudeGateway";
import type { AccountConnectStage } from "../../lib/accountRuntimePresentation";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";
import { Button } from "../ui/Button";
import { AccountRuntimeSetup } from "./AccountRuntimeSetup";
import {
  type CliAccountAction,
  useCliAccountActions,
} from "./useCliAccountActions";

type Props = {
  model: string;
  effort: ClaudeEffort;
  disabled?: boolean;
} & (
  | { accountOnly: true }
  | {
      accountOnly?: false;
      onModel: (value: string) => void;
      onEffort: (value: ClaudeEffort) => void;
    }
);
type LoginMethod = "subscription" | "console";
type AccountAction = CliAccountAction<LoginMethod>;

export function ClaudeSettingsFields(props: Props) {
  const { t } = useTranslation("components");
  const controller = useCliAccountActions<ClaudeAccount, LoginMethod>({
    connection: claudeConnection,
    kind: "claude-auth",
    primaryMethod: "subscription",
    login: (method) => claudeGateway.loginClaudeAccount(method),
    logout: () => claudeGateway.logoutClaudeAccount(),
    fallbackError: t("settings.claude.error"),
  });
  const { account, operation } = controller;
  const disabled = props.disabled || controller.busy;
  return (
    <>
      <Field as="div" label={t("settings.claude.account")}>
        <span>
          {account?.authenticated
            ? [account.email, account.plan].filter(Boolean).join(" · ")
            : t("chat.claudeLoginHint")}
        </span>
        <ClaudeAccountActions
          authenticated={account?.authenticated === true}
          disabled={disabled}
          stage={controller.stage}
          run={(action) => void controller.run(action)}
        />
      </Field>
      <AccountRuntimeSetup
        runtime="claude"
        runtimeMissing={controller.runtimeMissing}
        activity={operation.activity}
        signInError={controller.signInError}
        onCancel={operation.cancel}
      />
      {controller.otherError && <p role="alert">{controller.otherError}</p>}
      {!props.accountOnly && (
        <ClaudeModelFields {...props} account={account} disabled={disabled} />
      )}
    </>
  );
}

const LOGIN_LABELS: Record<LoginMethod, Record<AccountConnectStage, string>> = {
  subscription: {
    connect: "settings.claude.login",
    download: "settings.accountRuntime.claudeLogin",
    "retry-download": "settings.accountRuntime.claudeLoginRetry",
    downloading: "settings.accountRuntime.downloading",
    "signing-in": "settings.claude.login",
  },
  console: {
    connect: "settings.claude.console",
    download: "settings.accountRuntime.claudeConsole",
    "retry-download": "settings.accountRuntime.claudeConsoleRetry",
    downloading: "settings.accountRuntime.downloading",
    "signing-in": "settings.claude.console",
  },
};

/** Both sign-in methods fetch the CLI first when it is missing. */
function ClaudeAccountActions({
  authenticated,
  disabled,
  stage,
  run,
}: {
  authenticated: boolean;
  disabled: boolean;
  stage: (method: LoginMethod) => AccountConnectStage;
  run: (action: AccountAction) => void;
}) {
  const { t } = useTranslation("components");
  return (
    <div className="settings-inline-actions">
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => run(authenticated ? "logout" : "subscription")}
      >
        {authenticated
          ? t("settings.claude.logout")
          : t(LOGIN_LABELS.subscription[stage("subscription")])}
      </Button>
      {!authenticated && (
        <Button
          variant="ghost"
          disabled={disabled}
          onClick={() => run("console")}
        >
          {t(LOGIN_LABELS.console[stage("console")])}
        </Button>
      )}
      <Button
        variant="ghost"
        disabled={disabled}
        onClick={() => run("refresh")}
      >
        {t("settings.claude.refresh")}
      </Button>
    </div>
  );
}

function ClaudeModelFields(
  props: Extract<Props, { accountOnly?: false }> & {
    account: ClaudeAccount | null;
  },
) {
  const { t } = useTranslation("components");
  const { account, disabled } = props;
  const selected = account?.models.find((model) => model.id === props.model);
  return (
    <>
      <Field as="div" label={t("settings.claude.model")}>
        <Select
          ariaLabel={t("settings.claude.model")}
          value={props.model}
          disabled={disabled || !account?.authenticated}
          options={
            account?.models.length
              ? account.models.map((model) => ({
                  value: model.id,
                  label: model.displayName,
                }))
              : [{ value: props.model, label: props.model }]
          }
          onValueChange={(value) => {
            props.onModel(value);
            const next = account?.models.find((model) => model.id === value);
            if (
              next?.supportedReasoningEfforts.length &&
              !next.supportedReasoningEfforts.includes(props.effort)
            )
              props.onEffort(next.defaultReasoningEffort);
          }}
        />
      </Field>
      {Boolean(selected?.supportedReasoningEfforts.length) && (
        <Field as="div" label={t("settings.claude.effort")}>
          <Select
            ariaLabel={t("settings.claude.effort")}
            value={props.effort}
            disabled={disabled}
            options={(selected?.supportedReasoningEfforts ?? []).map(
              (value) => ({
                value,
                label: t(`settings.options.reasoning.${value}.label`, {
                  defaultValue: value,
                }),
              }),
            )}
            onValueChange={(value) => {
              const effort = selected?.supportedReasoningEfforts.find(
                (entry) => entry === value,
              );
              if (effort) props.onEffort(effort);
            }}
          />
        </Field>
      )}
    </>
  );
}
