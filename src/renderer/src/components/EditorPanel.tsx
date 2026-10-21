import React from "react";
import {
  SelectedBlockHeader,
  EditorPanelTabs,
  EmptyEditorPanel,
} from "./EditorPanelChrome";
import { EditorPanelBody } from "./EditorPanelBody";
import type {
  AppliedStylePresetSelection,
  EditorPanelProps,
  SelectedEditorPanelProps,
} from "./editorPanelTypes";
import { useEditorPanelTab } from "./useEditorPanelTab";

const NOOP_ACTION = (): void => undefined;
const NOOP_RESULT = (): boolean => false;

export function EditorPanel(props: EditorPanelProps): React.JSX.Element {
  if (props.block) {
    return <SelectedEditorPanel {...props} block={props.block} />;
  }
  return (
    <EmptyEditorPanel
      areaTranslateAvailable={props.areaTranslateAvailable ?? false}
      areaTranslateSelecting={props.areaTranslateSelecting ?? false}
      disabled={props.disabled}
      headerActions={props.headerActions}
      onStartAreaTranslate={props.onStartAreaTranslate}
    />
  );
}

function SelectedEditorPanel(
  props: SelectedEditorPanelProps,
): React.JSX.Element {
  const resolvedTransformMode = props.transformMode ?? "select";
  const [activeTab, setActiveTab] = useEditorPanelTab(
    resolvedTransformMode,
    props.editorTextTabRequestToken ?? 0,
    props.block.sourceText.trim().length === 0 &&
      props.block.translatedText.trim().length === 0,
    (props.selectedBlockCount ?? 0) > 1
      ? (props.selectionKey ?? String(props.selectedBlockCount))
      : "",
  );
  const panelIdBase = React.useId();
  const presetSelection = useAppliedStylePreset(props);

  return (
    <section className="editor-panel has-block">
      {props.embedded ? (
        <div className="editor-panel-sticky">
          <EditorPanelTabs
            activeTab={activeTab}
            baseId={panelIdBase}
            onSelect={setActiveTab}
          />
        </div>
      ) : (
        <SelectedBlockHeader
          activeTab={activeTab}
          baseId={panelIdBase}
          block={props.block}
          disabled={props.disabled}
          headerActions={props.headerActions}
          onDelete={props.onDelete}
          onDuplicate={props.onDuplicate}
          onSaveToLibrary={props.onSaveToLibrary ?? NOOP_ACTION}
          onRemoveBubbleLayout={props.onRemoveBubbleLayout ?? NOOP_ACTION}
          onSelect={setActiveTab}
        />
      )}
      <EditorPanelBody
        {...props}
        activeTab={activeTab}
        baseId={panelIdBase}
        presetSelection={presetSelection}
        transformMode={resolvedTransformMode}
      />
    </section>
  );
}

function useAppliedStylePreset({
  block,
  onApplyStylePreset = NOOP_ACTION,
  onDeleteStylePreset = NOOP_RESULT,
}: SelectedEditorPanelProps): AppliedStylePresetSelection {
  const [applied, setApplied] = React.useState<{
    blockId: string;
    presetId: string;
  } | null>(null);
  return {
    activePresetId: applied?.blockId === block.id ? applied.presetId : "",
    apply: (presetId) => {
      setApplied({ blockId: block.id, presetId });
      onApplyStylePreset(presetId);
    },
    clear: () => setApplied(null),
    delete: async (presetId) => {
      const deleted = await onDeleteStylePreset(presetId);
      if (deleted && applied?.presetId === presetId) setApplied(null);
      return deleted;
    },
  };
}
