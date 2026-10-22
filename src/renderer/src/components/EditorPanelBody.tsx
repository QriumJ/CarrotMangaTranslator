import React from "react";
import type {
  PanelFormatFieldKey,
  PanelFormatSelection,
  TransformEditorMode,
} from "../../../shared/panelBridgeTypes";
import type { TranslationBlock } from "../../../shared/textTypes";
import {
  buildBlocksCharacterFormatTarget,
  type CharacterFormatTarget,
} from "./editorCharacterFormatTarget";
import { EditorCharacterFormatSection } from "./EditorCharacterFormatSection";
import { TextBackgroundSettings } from "./EditorFormatControls";
import {
  EditorFormatGroups,
  EditorStylePresetControls,
} from "./EditorFormatGroups";
import { EditorTabPanel, type EditorTabId } from "./EditorPanelChrome";
import { TextEditorGroup } from "./EditorPanelSections";
import type {
  AppliedStylePresetSelection,
  SelectedEditorPanelProps,
} from "./editorPanelTypes";
import { TransformEditorGroup } from "./TransformEditorGroup";

type EditorPanelBodyProps = SelectedEditorPanelProps & {
  activeTab: EditorTabId;
  baseId: string;
  presetSelection: AppliedStylePresetSelection;
  transformMode: TransformEditorMode;
};

const EMPTY_FORMAT_SELECTION: PanelFormatSelection = {
  common: {},
  mixedFields: [],
};
const NOOP_ACTION = (): void => undefined;

export function EditorPanelBody(
  props: EditorPanelBodyProps,
): React.JSX.Element {
  const { activeTab, baseId, block } = props;
  return (
    <div className="editor-panel-body">
      {props.generatedLetteringControls}
      <EditorTabPanel activeTab={activeTab} baseId={baseId} tab="layout">
        <TransformEditorGroup
          key={block.id}
          block={block}
          disabled={props.disabled}
          mode={props.transformMode}
          pageSize={props.pageSize ?? null}
          templateMode={props.templateMode ?? false}
          onSelectMode={props.onSelectTransformMode ?? NOOP_ACTION}
          onUpdate={props.onUpdate}
        />
      </EditorTabPanel>
      <EditorTabPanel activeTab={activeTab} baseId={baseId} tab="format">
        <EditorFormatTab {...props} />
      </EditorTabPanel>
    </div>
  );
}

/**
 * The active block's text and its letter formatting first, then settings that
 * always cover the whole selection. Letter formatting follows the text
 * controller; without an active text edit it covers every selected block.
 * Presets and the text-area background lead the letter formatting as
 * block-wide controls, so repeated picks need no scroll.
 */
function EditorFormatTab(props: EditorPanelBodyProps): React.JSX.Element {
  const { block } = props;
  const selection = props.formatSelection ?? EMPTY_FORMAT_SELECTION;
  const mixedFields = React.useMemo<ReadonlySet<PanelFormatFieldKey>>(
    () => new Set(selection.mixedFields),
    [selection.mixedFields],
  );
  const blockCount = props.selectedBlockCount ?? 0;
  const editRequest = useBlockTextEditRequest(
    block.id,
    props.editorTextTabRequestToken ?? 0,
  );
  const { renderCharacterFormat, updateFormat } = useFormatTargets(
    props,
    mixedFields,
  );
  return (
    <>
      <TextEditorGroup
        key={block.id}
        block={block}
        disabled={props.disabled}
        pageSize={props.pageSize}
        resolvedFontSizePx={props.resolvedFontSizePx}
        selectionKey={props.selectionKey}
        textEditRequestToken={editRequest}
        textResetToken={props.editorTextResetToken}
        sourceActions={{
          aiUnavailable: props.aiUnavailable,
          onEraseOriginal: props.onEraseOriginal,
          onFitBubble: props.onFitBubble,
        }}
        renderCharacterFormat={(target) =>
          renderCharacterFormat(
            blockCount > 1 && target.scope === "block"
              ? {
                  ...buildBlocksCharacterFormatTarget({
                    block,
                    blockCount,
                    mixedFields,
                    onUpdate: updateFormat,
                  }),
                  commands: target.commands,
                }
              : target,
          )
        }
        onPreviewTextSelection={props.onPreviewTextSelection}
        onSuggestConsistentEdit={props.onSuggestConsistentEdit}
        onUpdate={props.onUpdate}
      />
      <EditorFormatGroups
        {...props}
        mixedFields={mixedFields}
        selectedBlockCount={blockCount}
        onUpdate={updateFormat}
      />
    </>
  );
}

/** Shared character-section renderer; direct formatting drops the preset. */
function useFormatTargets(
  props: EditorPanelBodyProps,
  mixedFields: ReadonlySet<PanelFormatFieldKey>,
): {
  renderCharacterFormat: (target: CharacterFormatTarget) => React.ReactNode;
  updateFormat: (patch: Partial<TranslationBlock>) => void;
} {
  const { block } = props;
  const [fontFamilyDraft, setFontFamilyDraft] = useBlockFontDraft(block);
  const updateFormat = (patch: Partial<TranslationBlock>): void => {
    props.presetSelection.clear();
    (props.onUpdateFormat ?? props.onUpdate)(patch);
  };
  const renderCharacterFormat = (
    target: CharacterFormatTarget,
  ): React.ReactNode => (
    <EditorCharacterFormatSection
      block={block}
      disabled={props.disabled}
      fontFamilyDraft={fontFamilyDraft}
      resolvedFontSizePx={props.resolvedFontSizePx ?? null}
      target={{
        ...target,
        apply: (patch) => {
          props.presetSelection.clear();
          target.apply(patch);
        },
      }}
      onAdjustFontSize={props.onAdjustFontSize}
      onFontFamilyDraftChange={setFontFamilyDraft}
      onOpenFontManager={props.onOpenFontManager}
      blockControls={
        <>
          <EditorStylePresetControls
            props={{
              ...props,
              activeStylePresetId: props.presetSelection.activePresetId,
              onApplyStylePreset: props.presetSelection.apply,
              onDeleteStylePreset: props.presetSelection.delete,
            }}
          />
          <TextBackgroundSettings
            block={block}
            disabled={props.disabled}
            mixedFields={mixedFields}
            onUpdate={updateFormat}
          />
        </>
      }
    />
  );
  return { renderCharacterFormat, updateFormat };
}

/** Keeps a whole-block font choice visible while the patch round-trips. */
function useBlockFontDraft(
  block: TranslationBlock,
): [string | undefined, (fontFamily?: string) => void] {
  const [draft, setDraft] = React.useState(block.fontFamily);
  React.useEffect(() => {
    setDraft(block.fontFamily);
  }, [block.id, block.fontFamily]);
  return [draft, setDraft];
}

/** A request belongs to the selected block when it was issued, not the next
 * block mounted in this panel. Remounting also discards composition state. */
function useBlockTextEditRequest(blockId: string, token: number): number {
  const previous = React.useRef(0);
  const [request, setRequest] = React.useState({ blockId: "", token: 0 });
  React.useEffect(() => {
    const changed = previous.current !== token;
    previous.current = token;
    setRequest({ blockId, token: changed ? token : 0 });
  }, [blockId, token]);
  return request.blockId === blockId ? request.token : 0;
}
