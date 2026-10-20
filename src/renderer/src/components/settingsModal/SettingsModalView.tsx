import React from "react";
import { McpSettingsPanel } from "./McpSettingsPanel";
import { useTranslation } from "react-i18next";
import type { ModelProvider } from "../../../../shared/settingsTypes";
import type { LibraryIndex } from "../../../../shared/libraryTypes";
import { SettingsModalFooter } from "./SettingsModalFooter";
import { Modal } from "../ui/Modal";
import { EngineSettingsPanel } from "./EngineSettingsPanel";
import { FormatDefaultsPanel } from "./FormatDefaultsPanel";
import {
  HardwareSettingsPanel,
  OcrSettingsSection,
} from "./HardwareSettingsPanel";
import { SettingsTabs } from "./SettingsTabs";
import {
  currentSettingsPage,
  settingsPageIds,
  type LlmSettingsTab,
} from "./settingsPages";
import { SettingsValidationMessages } from "./SettingsValidationMessages";
import { ShortcutsSettingsPanel } from "./ShortcutsSettingsPanel";
import { TestSettingsPanel } from "./TestSettingsPanel";
import { GeneralSettingsPanel } from "./GeneralSettingsPanel";
import type { SettingsTabId } from "../settingsModalTypes";
import type { SettingsSubmissionIssue } from "./settingsSubmissionIssue";
import { Button } from "../ui/Button";
import { Section } from "../ui/Section";
import { InfoIcon } from "../ui/icons";
import { LinkedWorkspaceSettingsPanel } from "./LinkedWorkspaceSettingsPanel";
import { InternetResearchSettingsPanel } from "./InternetResearchSettingsPanel";
import { ImageSettingsPanel } from "./ImageSettingsPanel";

export type SettingsModalViewProps = {
  activeTab: SettingsTabId;
  canSubmit: boolean;
  isDirty?: boolean;
  submissionIssue?: SettingsSubmissionIssue;
  controlsBusy: boolean;
  defaultsPreviewActive: boolean;
  generalPanelProps: React.ComponentProps<typeof GeneralSettingsPanel>;
  enginePanelProps: React.ComponentProps<typeof EngineSettingsPanel>;
  researchPanelProps: React.ComponentProps<
    typeof InternetResearchSettingsPanel
  >;
  hardwarePanelProps: React.ComponentProps<typeof HardwareSettingsPanel>;
  library?: LibraryIndex;
  formatPanelTitle: string;
  formatPanelProps: React.ComponentProps<typeof FormatDefaultsPanel>;
  onCancel: () => void;
  onOpenErrorReport: () => void;
  onOpenLogFolder: () => void;
  onOpenModelFolder: () => void;
  onReset: () => void;
  setActiveTab: React.Dispatch<React.SetStateAction<SettingsTabId>>;
  shortcutsPanelProps: React.ComponentProps<typeof ShortcutsSettingsPanel>;
  submit: () => void;
  testPanelProps: React.ComponentProps<typeof TestSettingsPanel>;
  validationProps: {
    apiAdvancedSettingsMessage?: string;
    apiAdvancedSettingsValid: boolean;
    apiBaseUrlValid: boolean;
    contextTokensValid: boolean;
    maxTokensValid: boolean;
    modelProvider: ModelProvider;
    sourceLanguageValid: boolean;
    targetLanguageValid: boolean;
  };
};

export function SettingsModalView(
  props: SettingsModalViewProps,
): React.JSX.Element {
  const { activeTab, setActiveTab, submissionIssue, controlsBusy, onCancel } =
    props;
  const [activeLlmTab, setActiveLlmTab] =
    React.useState<LlmSettingsTab>("translation");
  const navigation = { activeLlmTab, setActiveLlmTab };
  const revealIssue = useRevealSettingsIssue(
    submissionIssue,
    setActiveTab,
    setActiveLlmTab,
  );
  const { t } = useTranslation("components");
  return (
    <Modal
      width="min(920px, 100%)"
      fillHeight
      title={t("settings.title")}
      bodyClassName="settings-modal-body"
      onClose={onCancel}
      closeDisabled={controlsBusy}
      footer={
        <SettingsModalFooter
          canSubmit={props.canSubmit}
          submissionIssue={submissionIssue}
          onRevealIssue={revealIssue}
          controlsBusy={controlsBusy}
          onCancel={onCancel}
          immediate={["mcp", "results", "test"].includes(activeTab)}
          isDirty={props.isDirty}
          onReset={props.onReset}
          submit={props.submit}
        />
      }
    >
      <div className="settings-layout">
        {props.defaultsPreviewActive ? <SettingsDefaultsNotice /> : null}
        <SettingsTabs
          activeTab={activeTab}
          activeLlmTab={activeLlmTab}
          onSelectTab={setActiveTab}
          onSelectLlmTab={setActiveLlmTab}
        />
        <SettingsModalTabPanel
          {...props}
          navigation={navigation}
          supportActions={props}
        />
      </div>
    </Modal>
  );
}

function SettingsModalTabPanel({
  activeTab,
  supportActions,
  navigation,
  generalPanelProps,
  enginePanelProps,
  researchPanelProps,
  hardwarePanelProps,
  library,
  formatPanelTitle,
  formatPanelProps,
  shortcutsPanelProps,
  testPanelProps,
  validationProps,
}: Pick<
  SettingsModalViewProps,
  | "activeTab"
  | "generalPanelProps"
  | "enginePanelProps"
  | "researchPanelProps"
  | "hardwarePanelProps"
  | "library"
  | "formatPanelTitle"
  | "formatPanelProps"
  | "shortcutsPanelProps"
  | "testPanelProps"
  | "validationProps"
> & {
  navigation: LlmNavigation;
  supportActions: Pick<
    SettingsModalViewProps,
    "onOpenErrorReport" | "onOpenLogFolder" | "onOpenModelFolder"
  >;
}): React.JSX.Element {
  const ids = settingsPageIds(
    currentSettingsPage(activeTab, navigation.activeLlmTab),
  );
  return (
    <div
      className={[
        "settings-tabpanel",
        "modal-section",
        activeTab === "format" ? "settings-tabpanel-format" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="tabpanel"
      id={ids.panelId}
      aria-labelledby={ids.tabId}
    >
      {activeTab === "format" ? (
        <header className="settings-panel-header">
          <h2>{formatPanelTitle}</h2>
        </header>
      ) : null}
      <SettingsModalTabContent
        activeTab={activeTab}
        navigation={navigation}
        enginePanelProps={enginePanelProps}
        researchPanelProps={researchPanelProps}
        formatPanelProps={formatPanelProps}
        generalPanelProps={generalPanelProps}
        hardwarePanelProps={hardwarePanelProps}
        library={library}
        shortcutsPanelProps={shortcutsPanelProps}
        testPanelProps={testPanelProps}
        validationProps={validationProps}
      />
      {activeTab === "test" ? (
        <SettingsSupportActions {...supportActions} />
      ) : null}
    </div>
  );
}

function SettingsSupportActions(
  props: Pick<
    SettingsModalViewProps,
    "onOpenErrorReport" | "onOpenLogFolder" | "onOpenModelFolder"
  >,
) {
  const { t } = useTranslation("components");
  return (
    <Section title={t("settings.support.title")} density="compact" divided>
      <div className="settings-inline-actions">
        <Button onClick={props.onOpenLogFolder}>
          {t("settings.footer.openLogs")}
        </Button>
        <Button onClick={props.onOpenModelFolder}>
          {t("settings.footer.openModels")}
        </Button>
        <Button onClick={props.onOpenErrorReport}>
          {t("settings.footer.reportProblem")}
        </Button>
      </div>
    </Section>
  );
}

type SettingsModalTabContentProps = Pick<
  SettingsModalViewProps,
  | "activeTab"
  | "enginePanelProps"
  | "researchPanelProps"
  | "formatPanelProps"
  | "generalPanelProps"
  | "hardwarePanelProps"
  | "library"
  | "shortcutsPanelProps"
  | "testPanelProps"
  | "validationProps"
> & { navigation: LlmNavigation };

function SettingsModalTabContent({
  activeTab,
  navigation,
  enginePanelProps,
  researchPanelProps,
  formatPanelProps,
  generalPanelProps,
  hardwarePanelProps,
  library,
  shortcutsPanelProps,
  testPanelProps,
  validationProps,
}: SettingsModalTabContentProps): React.JSX.Element | null {
  if (activeTab === "mcp") return <McpSettingsPanel />;
  if (activeTab === "general")
    return <GeneralSettingsPanel {...generalPanelProps} />;
  if (activeTab === "format")
    return <FormatDefaultsPanel {...formatPanelProps} />;
  if (activeTab === "shortcuts")
    return <ShortcutsSettingsPanel {...shortcutsPanelProps} />;
  if (activeTab === "test") return <TestSettingsPanel {...testPanelProps} />;
  if (activeTab === "results") {
    return library ? <LinkedWorkspaceSettingsPanel library={library} /> : null;
  }
  if (activeTab !== "engine") return null;
  return (
    <LlmSettingsPanel
      navigation={navigation}
      hardwarePanelProps={hardwarePanelProps}
      enginePanelProps={enginePanelProps}
      researchPanelProps={researchPanelProps}
      validationProps={validationProps}
    />
  );
}

type LlmNavigation = {
  activeLlmTab: LlmSettingsTab;
  setActiveLlmTab: (tab: LlmSettingsTab) => void;
};

function LlmSettingsPanel({
  navigation,
  hardwarePanelProps,
  enginePanelProps,
  researchPanelProps,
  validationProps,
}: Pick<
  SettingsModalViewProps,
  | "enginePanelProps"
  | "researchPanelProps"
  | "validationProps"
  | "hardwarePanelProps"
> & { navigation: LlmNavigation }): React.JSX.Element {
  switch (navigation.activeLlmTab) {
    case "translation":
      return (
        <div className="settings-llm-panel">
          <EngineSettingsPanel {...enginePanelProps} />
          <div className="settings-validation-summary">
            <SettingsValidationMessages {...validationProps} />
          </div>
        </div>
      );
    case "hardware":
      return <HardwareSettingsPanel {...hardwarePanelProps} />;
    case "ocr":
      return <OcrSettingsSection {...hardwarePanelProps} />;
    case "image":
      return (
        <ImageSettingsPanel
          engine={enginePanelProps}
          hardware={hardwarePanelProps}
        />
      );
    case "research":
      return <InternetResearchSettingsPanel {...researchPanelProps} />;
  }
}

function focusSettingsIssue(issue: SettingsSubmissionIssue): void {
  const panel = document.getElementById(`settings-llm-panel-${issue.tab}`);
  const controls = panel?.querySelectorAll<
    HTMLInputElement | HTMLTextAreaElement
  >("input, textarea, select, button");
  const target = Array.from(controls ?? []).find(
    (control) =>
      control.getAttribute("aria-label") === issue.label ||
      control.closest("label")?.textContent?.trim().startsWith(issue.label),
  );
  const focusTarget =
    target ?? document.getElementById(`settings-llm-tab-${issue.tab}`);
  focusTarget?.focus();
  target?.scrollIntoView({ block: "center" });
}

function useRevealSettingsIssue(
  issue: SettingsSubmissionIssue | undefined,
  setActiveTab: SettingsModalViewProps["setActiveTab"],
  setActiveLlmTab: LlmNavigation["setActiveLlmTab"],
) {
  const frame = React.useRef(0);
  React.useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return React.useCallback(() => {
    if (!issue) return;
    cancelAnimationFrame(frame.current);
    setActiveTab("engine");
    setActiveLlmTab(issue.tab);
    frame.current = requestAnimationFrame(() => focusSettingsIssue(issue));
  }, [issue, setActiveTab, setActiveLlmTab]);
}

function SettingsDefaultsNotice(): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className="settings-draft-notice" role="status">
      <InfoIcon size={18} />
      <div>
        <strong>{t("settings.defaultsPreview.title")}</strong>
        <span>{t("settings.defaultsPreview.description")}</span>
      </div>
    </div>
  );
}
