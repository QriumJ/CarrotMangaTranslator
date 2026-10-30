import React from "react";
import { useTranslation } from "react-i18next";
import { AppUpdateSettings } from "../AppUpdateSection";
import type { TestState } from "../settingsModalTypes";
import { SettingsSection } from "./SettingsSection";
import { Button } from "../ui/Button";

type TestSettingsPanelProps = {
  canSubmit: boolean;
  controlsBusy: boolean;
  jobActive: boolean;
  runModelTest: () => Promise<void>;
  testLogLines: string[];
  testLogRef: React.RefObject<HTMLDivElement | null>;
  testState: TestState;
};

export function TestSettingsPanel({
  canSubmit,
  controlsBusy,
  jobActive,
  runModelTest,
  testLogLines,
  testLogRef,
  testState,
}: TestSettingsPanelProps): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className="settings-panel-stack">
      <AppUpdateSettings />
      <SettingsSection title={t("settings.test.title")}>
        <div className="settings-inline-actions">
          <Button
            type="button"
            onClick={() => void runModelTest()}
            disabled={controlsBusy || !canSubmit || jobActive}
            size="sm"
          >
            {testState.status === "running"
              ? t("settings.test.running")
              : t("settings.test.run")}
          </Button>
        </div>
        {testState.status !== "idle" ? (
          <div className={`settings-test-result ${testState.status}`}>
            <strong>{testState.message}</strong>
            {testState.detail ? <p>{testState.detail}</p> : null}
          </div>
        ) : null}
        {testLogLines.length > 0 ? (
          <div
            className="settings-test-log"
            ref={testLogRef}
            aria-label={t("settings.test.logAria")}
          >
            {testLogLines.map((line, index) => (
              <code key={`${index}-${line}`}>{line}</code>
            ))}
          </div>
        ) : null}
      </SettingsSection>
    </div>
  );
}
