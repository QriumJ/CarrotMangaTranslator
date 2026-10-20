import React from "react";
import { useTranslation } from "react-i18next";
import type { LibrarySort } from "../lib/librarySort";
import { Input } from "./ui/Field";
import { LibrarySortMenu } from "./LibrarySortMenu";
import { SidebarSectionCollapseButton } from "./SidebarSectionCollapseButton";
export function LibraryPanelHeader({
  searchDisabled,
  collapsed,
  disclosureActions,
  otherPanelCollapsed,
  onSearchChange,
  onSortChange,
  onToggleOtherPanel,
  searchQuery,
  sort,
}: {
  collapsed: boolean;
  searchDisabled: boolean;
  disclosureActions: React.ReactNode;
  otherPanelCollapsed: boolean;
  onSearchChange: (query: string) => void;
  onSortChange: (sort: LibrarySort) => void;
  onToggleOtherPanel: () => void;
  searchQuery: string;
  sort: LibrarySort;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className="panel-header library-panel-header">
      <h2>{t("library.title")}</h2>
      {!collapsed ? (
        <>
          <label
            className="library-search-shell"
            aria-label={t("library.searchLabel")}
          >
            <SearchIcon />
            <Input
              disabled={searchDisabled}
              className="library-search-input"
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t("library.searchPlaceholder")}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <LibrarySortMenu value={sort} onChange={onSortChange} />
          {disclosureActions}
        </>
      ) : null}
      <SidebarSectionCollapseButton
        collapsed={otherPanelCollapsed}
        controls="sidebar-page-panel"
        direction={otherPanelCollapsed ? "up" : "down"}
        onToggle={onToggleOtherPanel}
        sectionTitle={t("common.pages")}
      />
    </div>
  );
}

function SearchIcon(): React.JSX.Element {
  return (
    <svg
      className="library-search-icon"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8.5"
        cy="8.5"
        r="5.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M12.5 12.5L16.5 16.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
