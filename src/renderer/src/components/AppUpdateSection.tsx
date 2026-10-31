import React from "react";
import { useTranslation } from "react-i18next";
import type { AppUpdateState } from "../../../shared/appUpdate";
import { hasAppUpdateNews, useAppUpdate } from "../hooks/useAppUpdate";
import { createAppUpdateCommands } from "../lib/appUpdateCommands";
import { appUpdateGateway } from "../api/appUpdateGateway";
import { receiveAppUpdate } from "../lib/appUpdateStore";
import { Button } from "./ui/Button";
import { CheckboxField } from "./ui/CheckboxField";
import { ProgressBar } from "./ui/ProgressBar";
import { InlineMessage } from "./ui/InlineMessage";
import { Section } from "./ui/Section";
import styles from "./AppUpdateSection.module.css";

const PENDING_PHASES = ["checking", "downloading", "preparing", "installing"];
const STATUS_CENTER_PHASES = ["available", "downloading", "ready", "error"];

/** Status-center entry: one headline, one action, shown only when there is news. */
export function AppUpdateStatus(): React.JSX.Element | null {
  const state = useAppUpdate();
  const { t } = useTranslation("components");
  if (!hasAppUpdateNews(state)) return null;
  return (
    <section className={styles.status} aria-label={t("settings.update.title")}>
      {state.phase === "error" ? (
        <UpdateError state={state} />
      ) : (
        <UpdateProgressSummary state={state} />
      )}
    </section>
  );
}

function UpdateProgressSummary({
  state,
}: {
  state: AppUpdateState;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const noteId = React.useId();
  const blocked = state.phase === "ready" && state.busy;
  const showsVersions = ["available", "ready"].includes(state.phase);
  return (
    <>
      <div className={styles.row}>
        <div className={styles.summary}>
          {/* Percent stays out of the live region; the progressbar carries it. */}
          <p className={styles.headline} role="status">
            {t(`settings.update.phases.${state.phase}`, {
              version: state.version,
            })}
          </p>
          {showsVersions ? (
            <span className={styles.meta}>
              {t("settings.update.currentVersion", {
                version: state.currentVersion,
              })}
            </span>
          ) : null}
        </div>
        {showsVersions ? (
          <UpdateAction
            state={state}
            describedBy={blocked ? noteId : undefined}
          />
        ) : null}
      </div>
      {state.phase === "downloading" ? (
        <DownloadProgress state={state} />
      ) : PENDING_PHASES.includes(state.phase) ? (
        <ProgressBar
          label={t(`settings.update.phases.${state.phase}`, {
            version: state.version,
          })}
          mode="indeterminate"
        />
      ) : null}
      {blocked ? (
        <p id={noteId} className={styles.note}>
          {t("settings.update.busy")}
        </p>
      ) : null}
    </>
  );
}

function UpdateError({ state }: { state: AppUpdateState }): React.JSX.Element {
  const { t } = useTranslation("components");
  const noteId = React.useId();
  // A "busy" error already names the reason, so the note would repeat it.
  const blocked =
    state.errorStage === "install" && state.busy && state.error !== "busy";
  return (
    <>
      <InlineMessage
        variant="danger"
        title={t("settings.update.phases.error")}
        detail={state.error ? t(`settings.update.errors.${state.error}`) : null}
      />
      {state.supported ? (
        <div className={blocked ? styles.row : styles.actions}>
          {blocked ? (
            <p id={noteId} className={styles.note}>
              {t("settings.update.busy")}
            </p>
          ) : null}
          <UpdateAction
            state={state}
            describedBy={blocked ? noteId : undefined}
          />
        </div>
      ) : null}
    </>
  );
}

function DownloadProgress({
  state,
}: {
  state: AppUpdateState;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const commands = createAppUpdateCommands(t, state.platform);
  const transferred = state.transferred ?? 0;
  const total = state.total || 1;
  const percent = `${Math.min(100, Math.floor((100 * transferred) / total))}%`;
  return (
    <div className={styles.progress}>
      <ProgressBar
        className={styles.bar}
        label={t("settings.update.phases.downloading", {
          version: state.version,
        })}
        mode="determinate"
        value={transferred}
        max={total}
        valueText={percent}
      />
      <span className={styles.percent} aria-hidden="true">
        {percent}
      </span>
      <Button size="sm" onClick={commands["cancel-app-update"].run}>
        {commands["cancel-app-update"].label}
      </Button>
    </div>
  );
}

function UpdateAction({
  state,
  describedBy,
}: {
  state: AppUpdateState;
  describedBy?: string;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const commands = createAppUpdateCommands(t, state.platform);
  const install = state.phase === "ready" || state.errorStage === "install";
  const command =
    commands[
      install
        ? "install-app-update"
        : state.phase === "available" || state.errorStage === "download"
          ? "download-app-update"
          : "check-app-update"
    ];
  return (
    <Button
      size="sm"
      variant="primary"
      disabled={install && state.busy}
      aria-describedby={describedBy}
      onClick={command.run}
    >
      {command.label}
    </Button>
  );
}

/** Settings entry: version, manual check, and the startup preference. */
export function AppUpdateSettings(): React.JSX.Element | null {
  const state = useAppUpdate();
  const { t } = useTranslation("components");
  const [preference, setPreference] = React.useState<
    "idle" | "saving" | "failed"
  >("idle");
  if (!state) return null;
  const commands = createAppUpdateCommands(t, state.platform);
  const checkFailed = state.phase === "error" && state.errorStage === "check";
  return (
    <Section
      bodyClassName="settings-section-body"
      className="settings-section"
      headerClassName="settings-section-header"
      title={t("settings.update.title")}
    >
      <div className={styles.row}>
        <div className={styles.summary}>
          <p className={styles.headline}>
            {t("settings.update.currentVersion", {
              version: state.currentVersion,
            })}
          </p>
          <SettingsStatusLine state={state} />
        </div>
        {state.supported ? (
          <Button
            size="sm"
            disabled={PENDING_PHASES.includes(state.phase)}
            onClick={commands["check-app-update"].run}
          >
            {commands["check-app-update"].label}
          </Button>
        ) : null}
      </div>
      {checkFailed && state.error ? (
        <InlineMessage
          variant="danger"
          title={t("settings.update.phases.error")}
          detail={t(`settings.update.errors.${state.error}`)}
        />
      ) : null}
      <CheckboxField
        label={t("settings.update.onStartup")}
        checked={state.checkOnStartup}
        disabled={preference === "saving"}
        onCheckedChange={(enabled) => {
          setPreference("saving");
          void appUpdateGateway
            .setAppUpdateCheckOnStartup(enabled)
            .then((next) => {
              receiveAppUpdate(next);
              setPreference("idle");
            })
            .catch(() => setPreference("failed"));
        }}
      />
      {preference === "failed" ? (
        <InlineMessage
          variant="danger"
          title={t("settings.update.preferenceError")}
        />
      ) : null}
    </Section>
  );
}

function SettingsStatusLine({
  state,
}: {
  state: AppUpdateState;
}): React.JSX.Element | null {
  const { t } = useTranslation("components");
  if (!state.supported)
    return (
      <span className={styles.meta}>
        {t("settings.update.errors.unsupported")}
      </span>
    );
  if (state.phase === "idle" || state.errorStage === "check") return null;
  const phase = t(`settings.update.phases.${state.phase}`, {
    version: state.version,
  });
  return (
    <span className={styles.meta} role="status">
      {STATUS_CENTER_PHASES.includes(state.phase)
        ? `${phase} · ${t("settings.update.statusCenterHint")}`
        : phase}
    </span>
  );
}
