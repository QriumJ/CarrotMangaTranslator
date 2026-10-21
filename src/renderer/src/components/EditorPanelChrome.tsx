import { BubbleLayoutOption } from "./EditorPanelSections";
import React from "react";
import { IconDotsVertical, IconLibraryPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { TranslationBlock } from "../../../shared/textTypes";
import { Button } from "./ui/Button";
import { IconButton } from "./ui/IconButton";
import { CopyIcon, TrashIcon } from "./ui/icons";
import { MenuSurface } from "./ui/MenuSurface";
import { Tabs } from "./ui/Tabs";
import { usePopupController } from "./ui/usePopupController";

const EDITOR_TABS = ["format", "layout"] as const;
export type EditorTabId = (typeof EDITOR_TABS)[number];

type BlockOverflowMenuProps = {
  block: TranslationBlock;
  disabled: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onSaveToLibrary: () => void;
};

function BlockOverflowMenu({
  block,
  disabled,
  onDelete,
  onDuplicate,
  onSaveToLibrary,
}: BlockOverflowMenuProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const [open, setOpen] = React.useState(false);
  const { close, contentRef, rootRef, toggle, triggerRef } = usePopupController(
    {
      disabled,
      initialFocus: '[role^="menuitem"]:not(:disabled)',
      open,
      onOpenChange: setOpen,
    },
  );
  React.useEffect(() => setOpen(false), [block.id]);
  const run = (action: () => void): void => {
    close(true);
    action();
  };
  const label = t("editor.moreActions", { defaultValue: "블록 작업 더 보기" });
  return (
    <div className="editor-overflow" ref={rootRef}>
      <IconButton
        ref={triggerRef}
        size="sm"
        label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={toggle}
      >
        <IconDotsVertical size={17} stroke={2.1} aria-hidden="true" />
      </IconButton>
      {open && !disabled ? (
        <MenuSurface
          ref={contentRef}
          className="editor-overflow-menu"
          ariaLabel={label}
          onClose={close}
        >
          <BlockOverflowMenuItems
            onDelete={() => run(onDelete)}
            onDuplicate={() => run(onDuplicate)}
            onSaveToLibrary={() => run(onSaveToLibrary)}
          />
        </MenuSurface>
      ) : null}
    </div>
  );
}

function BlockOverflowMenuItems({
  onDelete,
  onDuplicate,
  onSaveToLibrary,
}: Omit<BlockOverflowMenuProps, "block" | "disabled">): React.JSX.Element {
  const { t } = useTranslation("components");
  // 자동 지우기 제외 lives in 블록 전체 설정, where it covers every selected
  // block; this menu only holds active-block commands.
  return (
    <>
      <Button
        role="menuitem"
        type="button"
        onClick={onSaveToLibrary}
        variant="bare"
      >
        <IconLibraryPlus size={17} stroke={2.1} aria-hidden="true" />
        <span>{t("blockLibrary.saveAction")}</span>
      </Button>
      <Button
        role="menuitem"
        type="button"
        onClick={onDuplicate}
        variant="bare"
      >
        <CopyIcon size={16} />
        <span>{t("common.duplicate")}</span>
      </Button>
      <Button
        className="danger"
        role="menuitem"
        type="button"
        onClick={onDelete}
        variant="bare"
      >
        <TrashIcon size={16} />
        <span>{t("common.delete")}</span>
      </Button>
    </>
  );
}

function EditorPanelHeader({
  actions,
  excluded,
}: {
  actions?: React.ReactNode;
  excluded: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <header className="editor-panel-header">
      <div className="editor-panel-title">
        <h2>{t("common.blocks")}</h2>
        {excluded ? (
          <span className="editor-state-badge">
            {t("editor.inpainting.exclude")}
          </span>
        ) : null}
      </div>
      {actions ? (
        <div className="editor-panel-header-actions">{actions}</div>
      ) : null}
    </header>
  );
}

export function EditorPanelTabs({
  activeTab,
  baseId,
  onSelect,
}: {
  activeTab: EditorTabId;
  baseId: string;
  onSelect: (tab: EditorTabId) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const labels: Record<EditorTabId, string> = {
    layout: t("editor.tabs.layout", { defaultValue: "배치" }),
    format: t("editor.tabs.format", { defaultValue: "서식" }),
  };
  return (
    <Tabs
      className="editor-panel-tabs"
      ariaLabel={t("editor.tabs.label", {
        defaultValue: "블록 편집 영역",
      })}
      items={EDITOR_TABS.map((tab) => ({
        value: tab,
        label: labels[tab],
        id: `${baseId}-tab-${tab}`,
        panelId: `${baseId}-panel-${tab}`,
      }))}
      value={activeTab}
      onChange={onSelect}
    />
  );
}

export function EditorTabPanel({
  activeTab,
  baseId,
  children,
  tab,
}: {
  activeTab: EditorTabId;
  baseId: string;
  children: React.ReactNode;
  tab: EditorTabId;
}): React.JSX.Element {
  return (
    <div
      id={`${baseId}-panel-${tab}`}
      className="editor-tab-panel"
      aria-labelledby={`${baseId}-tab-${tab}`}
      hidden={activeTab !== tab}
      role="tabpanel"
    >
      {children}
    </div>
  );
}

export function EmptyEditorPanel({
  areaTranslateAvailable,
  areaTranslateSelecting,
  disabled,
  headerActions,
  onStartAreaTranslate,
}: {
  areaTranslateAvailable: boolean;
  areaTranslateSelecting: boolean;
  disabled: boolean;
  headerActions?: React.ReactNode;
  onStartAreaTranslate?: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <section className="editor-panel muted">
      <EditorPanelHeader actions={headerActions} excluded={false} />
      <Button
        className={`area-translate-button ${areaTranslateSelecting ? "active" : ""}`}
        disabled={disabled || !areaTranslateAvailable}
        onClick={onStartAreaTranslate}
        variant="primary"
      >
        {t(
          areaTranslateSelecting
            ? "areaTranslation.cancelSelection"
            : "areaTranslation.title",
        )}
      </Button>
    </section>
  );
}

export function SelectedBlockHeader({
  activeTab,
  baseId,
  block,
  disabled,
  headerActions,
  onDelete,
  onDuplicate,
  onSaveToLibrary,
  onRemoveBubbleLayout,
  onSelect,
}: {
  activeTab: EditorTabId;
  baseId: string;
  block: TranslationBlock;
  disabled: boolean;
  headerActions?: React.ReactNode;
  onDelete: () => void;
  onDuplicate: () => void;
  onSaveToLibrary: () => void;
  onRemoveBubbleLayout: () => void;
  onSelect: (tab: EditorTabId) => void;
}): React.JSX.Element {
  return (
    <div className="editor-panel-sticky">
      <EditorPanelHeader
        excluded={Boolean(block.inpaintExcluded)}
        actions={
          <>
            {headerActions}
            <BlockOverflowMenu
              block={block}
              disabled={disabled}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onSaveToLibrary={onSaveToLibrary}
            />
          </>
        }
      />
      <EditorPanelTabs
        activeTab={activeTab}
        baseId={baseId}
        onSelect={onSelect}
      />
      {block.bubbleLayout ? (
        <BubbleLayoutOption
          disabled={disabled}
          onRemove={onRemoveBubbleLayout}
        />
      ) : null}
    </div>
  );
}
