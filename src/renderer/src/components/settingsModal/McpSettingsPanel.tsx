import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { localizedMcpScopes as localizedScopes } from "./mcpScopeLabels";
import React from "react";
import type {
  McpDesktopStatus,
  McpDiagnostics,
} from "../../../../shared/mcpDesktopTypes";
import { mcpGateway } from "../../api/mcpGateway";
import { Button } from "../ui/Button";
import { CheckboxField } from "../ui/CheckboxField";
import { CollapsibleSection, Section } from "../ui/Section";
import { useMcpSettings } from "./useMcpSettings";
import { McpConnectionGuide, McpTailscaleGuide } from "./McpConnectionGuide";
import styles from "./McpSettingsPanel.module.css";

type Props = {
  status: McpDesktopStatus | null;
  error: string | null;
  busy: boolean;
  diagnostics: McpDiagnostics | null;
  run: (action: () => Promise<unknown>) => Promise<void>;
  diagnose: () => Promise<void>;
};
export function McpSettingsPanel(): React.JSX.Element {
  return <McpSettingsView {...useMcpSettings()} />;
}
export function McpSettingsView(props: Props): React.JSX.Element {
  const { status } = props;
  return (
    <div className={styles.stack}>
      <McpServerSection {...props} />
      <McpHelp {...props} />
      {status && <McpConnections {...props} status={status} />}
      {status && <McpPermissions {...props} status={status} />}
    </div>
  );
}
function McpServerSection({ status, error, busy, run }: Props) {
  const { t } = useTranslation("components");
  return (
    <Section
      title={t("mcp.title")}
      description={t("mcp.description")}
      density="compact"
      bodyClassName={styles.body}
      actions={<McpServerActions status={status} busy={busy} run={run} />}
    >
      <p className={styles.status} data-state={status?.state} role="status">
        <span className={styles.dot} aria-hidden="true" />
        {status ? stateLabel(status.state, t) : t("mcp.checking")}
      </p>
      {status?.message && (
        <p className={styles.note} role="status">
          {status.message}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {status?.url && (
        <div className={styles.addressRow}>
          <code className={styles.address}>{status.url}</code>
          <Button
            variant={
              status.state === "online" && status.pending.length === 0
                ? "primary"
                : "secondary"
            }
            disabled={busy}
            onClick={() => void run(() => mcpGateway.copyMcpUrl())}
          >
            {t("mcp.copy")}
          </Button>
        </div>
      )}
      <McpStartupOptions status={status} busy={busy} run={run} />
    </Section>
  );
}
function McpConnections({
  status,
  busy,
  run,
}: Props & { status: McpDesktopStatus }) {
  const { t, i18n } = useTranslation("components");
  const connections = status.connections.filter(
    (connection) => !connection.revoked,
  );
  return (
    <Section
      title={t("mcp.connectedApps")}
      density="compact"
      divided
      bodyClassName={styles.body}
    >
      {status.pending.map((request) => (
        <McpPairingRequestView
          key={request.id}
          request={request}
          busy={busy}
          run={run}
        />
      ))}
      {connections.length === 0 && status.pending.length === 0 && (
        <p className={styles.note}>
          {status.state === "online"
            ? t("mcp.emptyOnline")
            : t("mcp.emptyOffline")}
        </p>
      )}
      {connections.map((connection) => (
        <div key={connection.id} className={styles.connection}>
          <div className={styles.identity}>
            <strong>{connection.clientName}</strong>
            <p
              className={styles.note}
              title={localizedScopes(connection.scope, t)}
            >
              {localizedScopes(connection.scope, t, "compact")}
            </p>
            <time
              className={styles.timestamp}
              dateTime={new Date(connection.createdAt).toISOString()}
            >
              {t("mcp.approved", {
                date: new Date(connection.createdAt).toLocaleString(
                  i18n.resolvedLanguage ?? i18n.language,
                ),
              })}
            </time>
          </div>
          <Button
            size="sm"
            disabled={busy}
            aria-label={t("mcp.disconnectNamed", {
              name: connection.clientName,
            })}
            onClick={() =>
              void run(() => mcpGateway.revokeMcpConnection(connection.id))
            }
          >
            {t("mcp.disconnect")}
          </Button>
        </div>
      ))}
    </Section>
  );
}
function McpPermissions({
  status,
  busy,
  run,
}: Props & { status: McpDesktopStatus }) {
  const { t } = useTranslation("components");
  return (
    <Section
      title={t("mcp.permissions")}
      density="compact"
      divided
      bodyClassName={styles.body}
      description={t("mcp.permissionsNote")}
    >
      <p className={styles.note}>{t("mcp.readAccess")}</p>
      <div
        className={styles.permissions}
        role="group"
        aria-label={t("mcp.permissionLabel")}
      >
        <CheckboxField
          className={styles.permission}
          label={t("mcp.images")}
          checked={status.preferences.allowImages}
          disabled={busy}
          onCheckedChange={(allowImages) =>
            void run(() =>
              mcpGateway.configureMcp({ ...status.preferences, allowImages }),
            )
          }
        />
        <CheckboxField
          className={styles.permission}
          label={t("mcp.editing")}
          checked={status.preferences.allowEditing}
          disabled={busy}
          onCheckedChange={(allowEditing) =>
            void run(() =>
              mcpGateway.configureMcp({ ...status.preferences, allowEditing }),
            )
          }
        />
        <CheckboxField
          className={styles.permission}
          label={t("mcp.processing")}
          checked={status.preferences.allowProcessing === true}
          disabled={busy}
          onCheckedChange={(allowProcessing) =>
            void run(() =>
              mcpGateway.configureMcp({
                ...status.preferences,
                allowProcessing,
              }),
            )
          }
        />
      </div>
      {status.preferences.allowProcessing && (
        <p className={styles.note}>{t("mcp.cost")}</p>
      )}
    </Section>
  );
}
function McpHelp({ status, error, busy, run, diagnose, diagnostics }: Props) {
  const { t } = useTranslation("components");
  const [expanded, setExpanded] = React.useState<boolean | null>(null);
  return (
    <CollapsibleSection
      title={t("mcp.help")}
      density="compact"
      divided
      expanded={
        expanded ?? (!!error || (status !== null && status.state !== "online"))
      }
      onExpandedChange={setExpanded}
      bodyClassName={styles.body}
    >
      <McpTailscaleGuide busy={busy} run={run} />
      <div className={styles.actions}>
        <Button
          disabled={status?.state !== "online" || busy}
          onClick={() => void diagnose()}
        >
          {t("mcp.diagnose")}
        </Button>
      </div>
      <p className={styles.note}>{t("mcp.lifecycle")}</p>
      <p className={styles.note}>{t("mcp.processingHelp")}</p>
      {diagnostics && (
        <div className={styles.body} role="status">
          <strong>
            {diagnostics.ok ? t("mcp.passed") : t("mcp.needsAttention")}
          </strong>
          <p className={styles.note}>{t("mcp.diagnosticNote")}</p>
          {diagnostics.checks.map((check) => (
            <p
              className={check.passed ? styles.note : styles.error}
              key={check.name}
            >
              {check.passed ? t("mcp.pass") : t("mcp.fail")} · {check.name}:{" "}
              {check.message}
            </p>
          ))}
        </div>
      )}
      <McpConnectionGuide
        url={status?.state === "online" ? status.url : null}
        busy={busy}
        run={run}
      />
    </CollapsibleSection>
  );
}
function stateLabel(
  state: McpDesktopStatus["state"],
  t: TFunction<"components">,
) {
  return {
    off: t("mcp.off"),
    starting: t("mcp.starting"),
    online: t("mcp.online"),
    stopping: t("mcp.stopping"),
    error: t("mcp.needsAttention"),
  }[state];
}

function McpServerActions({
  status,
  busy,
  run,
}: Pick<Props, "status" | "busy" | "run">) {
  const { t } = useTranslation("components");
  const enabled =
    status !== null &&
    ["online", "starting", "stopping"].includes(status.state);
  return (
    <Button
      variant={enabled ? "secondary" : "primary"}
      disabled={!status || (busy && !enabled)}
      onClick={() => void run(() => mcpGateway.setMcpEnabled(!enabled))}
    >
      {enabled ? t("mcp.disable") : t("mcp.enable")}
    </Button>
  );
}

function McpStartupOptions({
  status,
  busy,
  run,
}: Pick<Props, "status" | "busy" | "run">) {
  const { t } = useTranslation("components");
  return (
    <>
      <div className={styles.actions}>
        <CheckboxField
          label={t("mcp.autoStart")}
          className={styles.permission}
          checked={status?.preferences.autoStart ?? false}
          disabled={!status || busy}
          onCheckedChange={(autoStart) => {
            if (status)
              void run(() =>
                mcpGateway.configureMcp({ ...status.preferences, autoStart }),
              );
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void run(() => mcpGateway.openMcpHelp("chatgpt"))}
        >
          {t("mcp.openChatgpt")}
        </Button>
      </div>
      {status?.setupUrl && (
        <Button
          disabled={busy}
          onClick={() => void run(() => mcpGateway.openMcpHelp("setup"))}
        >
          {t("mcp.allowTailscale")}
        </Button>
      )}
    </>
  );
}

function McpPairingRequestView({
  request,
  busy,
  run,
}: Pick<Props, "busy" | "run"> & {
  request: McpDesktopStatus["pending"][number];
}) {
  const { t } = useTranslation("components");
  return (
    <div className={styles.request}>
      <div className={styles.row}>
        <div className={styles.identity}>
          <strong>{t("mcp.pairing")}</strong>
          <span className={styles.note}>
            {t("mcp.clientName", { name: request.clientName })}
          </span>
        </div>
        <strong
          className={styles.code}
          aria-label={t("mcp.code", { code: request.code })}
        >
          {request.code}
        </strong>
      </div>
      <p className={styles.note}>{t("mcp.verifyCode")}</p>
      {request.redirectUri && (
        <p className={styles.note}>
          {t("mcp.redirect")}{" "}
          <span className={styles.address}>{request.redirectUri}</span>
        </p>
      )}
      <p className={styles.note}>
        {t("mcp.requested", { scopes: localizedScopes(request.scope, t) })}
      </p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() =>
            void run(() => mcpGateway.resolveMcpPairing(request.id, true))
          }
        >
          {t("mcp.approve")}
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            void run(() => mcpGateway.resolveMcpPairing(request.id, false))
          }
        >
          {t("mcp.deny")}
        </Button>
      </div>
    </div>
  );
}
