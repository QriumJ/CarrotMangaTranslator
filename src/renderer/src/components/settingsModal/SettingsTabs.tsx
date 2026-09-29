import React from "react";
import { useTranslation } from "react-i18next";
import type { SettingsTabId } from "../settingsModalTypes";
import { Tabs } from "../ui/Tabs";
import {
  SETTINGS_PAGES,
  currentSettingsPage,
  isLlmPage,
  settingsPageIds,
  type LlmSettingsTab,
} from "./settingsPages";

type SettingsTabsProps = {
  activeTab: SettingsTabId;
  activeLlmTab: LlmSettingsTab;
  onSelectTab: (tabId: SettingsTabId) => void;
  onSelectLlmTab: (tab: LlmSettingsTab) => void;
};

export function SettingsTabs({
  activeTab,
  activeLlmTab,
  onSelectTab,
  onSelectLlmTab,
}: SettingsTabsProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const items = SETTINGS_PAGES.map(({ page, group, labelKey }) => ({
    value: page,
    label: t(labelKey),
    group: t(`settings.tabs.groups.${group}`),
    id: settingsPageIds(page).tabId,
    panelId: settingsPageIds(page).panelId,
  }));
  return (
    <Tabs
      className="settings-tabs"
      tabClassName="settings-tab"
      groupClassName="settings-tab-group"
      orientation="vertical"
      ariaLabel={t("settings.tabs.ariaLabel")}
      items={items}
      value={currentSettingsPage(activeTab, activeLlmTab)}
      onChange={(page) => {
        if (!isLlmPage(page)) return onSelectTab(page);
        onSelectTab("engine");
        onSelectLlmTab(page);
      }}
    />
  );
}
