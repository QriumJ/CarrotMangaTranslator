import type { BlockFormatGroupId } from "../../../shared/blockFormat";
import type {
  BlockStylePresetSummary,
  CreateBlockStylePresetInput,
} from "../../../shared/blockStylePresets";
import type { TranslationBlock } from "../../../shared/textTypes";
import type { PanelFormatFieldKey } from "../../../shared/panelBridgeTypes";
import type { FormatApplyScope } from "../hooks/blockEditingStatus";
import type { BlockBackgroundApplyScope } from "../hooks/useApplyBlockBackgroundOpacityAction";
import { BlockDisplayGroup } from "./BlockDisplayGroup";
import { BlockStylePresetControls } from "./BlockStylePresetControls";
import { FormatEditorGroup } from "./EditorFormatControls";
import { resolveEditorPanelModel } from "./editorPanelUtils";

type EditorFormatGroupsProps = {
  block: TranslationBlock;
  disabled: boolean;
  disableChapterApply?: boolean;
  mixedFields: ReadonlySet<PanelFormatFieldKey>;
  onApplyBlockBackgroundOpacity?: (scope: BlockBackgroundApplyScope) => void;
  onApplyFormat?: (
    scope: FormatApplyScope,
    groupIds: BlockFormatGroupId[],
  ) => void;
  onUpdate: (patch: Partial<TranslationBlock>) => void;
  resolvedFontSizePx?: number | null;
  selectedBlockCount: number;
  selectionKey?: string;
  bubblePaddingRatio?: number | null;
  onApplyBubblePadding?: (paddingRatio: number) => void;
};

export type EditorStylePresetProps = {
  activeStylePresetId: string;
  canCreateStylePreset?: boolean;
  disabled: boolean;
  onApplyStylePreset: (presetId: string) => void;
  onCreateStylePreset?: (
    input: CreateBlockStylePresetInput,
  ) => boolean | Promise<boolean>;
  onDeleteStylePreset: (presetId: string) => boolean | Promise<boolean>;
  onOpenStylePresetManager?: () => void;
  onOverwriteStylePreset?: (presetId: string) => boolean | Promise<boolean>;
  onRenameStylePreset?: (
    presetId: string,
    name: string,
  ) => boolean | Promise<boolean>;
  showStylePresets?: boolean;
  stylePresets?: readonly BlockStylePresetSummary[];
};

const EMPTY_STYLE_PRESETS: readonly BlockStylePresetSummary[] = [];
const NOOP_RESULT = (): boolean => false;

/** Whole-block settings and editor display. */
export function EditorFormatGroups(
  props: EditorFormatGroupsProps,
): React.JSX.Element {
  const { block, disabled, mixedFields, onUpdate } = props;
  const disableChapterApply = props.disableChapterApply ?? false;
  return (
    <>
      <FormatEditorGroup
        block={block}
        disabled={disabled}
        disableChapterApply={disableChapterApply}
        mixedFields={mixedFields}
        model={resolveEditorPanelModel(block, props.resolvedFontSizePx)}
        onApplyFormat={props.onApplyFormat}
        onUpdate={onUpdate}
        selectedBlockCount={props.selectedBlockCount}
        selectionKey={props.selectionKey}
        bubblePaddingRatio={props.bubblePaddingRatio}
        onApplyBubblePadding={props.onApplyBubblePadding}
      />
      <BlockDisplayGroup
        block={block}
        disabled={disabled}
        disableChapterApply={disableChapterApply}
        mixed={mixedFields.has("opacity")}
        onApply={props.onApplyBlockBackgroundOpacity}
        onUpdate={onUpdate}
      />
    </>
  );
}

/** Style presets; the editor places them first in the letter formatting. */
export function EditorStylePresetControls({
  props,
}: {
  props: EditorStylePresetProps;
}): React.JSX.Element | null {
  if (props.showStylePresets === false) return null;
  return (
    <BlockStylePresetControls
      activePresetId={props.activeStylePresetId}
      canCreate={props.canCreateStylePreset ?? false}
      disabled={props.disabled}
      presets={props.stylePresets ?? EMPTY_STYLE_PRESETS}
      onApply={props.onApplyStylePreset}
      onCreate={props.onCreateStylePreset ?? NOOP_RESULT}
      onDelete={props.onDeleteStylePreset}
      onManage={props.onOpenStylePresetManager}
      onOverwrite={props.onOverwriteStylePreset ?? NOOP_RESULT}
      onRename={props.onRenameStylePreset ?? NOOP_RESULT}
    />
  );
}
