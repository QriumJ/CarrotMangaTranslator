import type React from "react";
import type { BlockFormatGroupId } from "../../../shared/blockFormat";
import type {
  BlockStylePresetSummary,
  CreateBlockStylePresetInput,
} from "../../../shared/blockStylePresets";
import type {
  PanelFormatSelection,
  PanelTextSelection,
  TransformEditorMode,
} from "../../../shared/panelBridgeTypes";
import type { TranslationBlock } from "../../../shared/textTypes";
import type { FormatApplyScope } from "../hooks/blockEditingStatus";
import type { BlockBackgroundApplyScope } from "../hooks/useApplyBlockBackgroundOpacityAction";

export type EditorPanelProps = {
  generatedLetteringControls?: React.ReactNode;
  block: TranslationBlock | null;
  disabled: boolean;
  /** Embeds the production editor controls without page-level panel chrome. */
  embedded?: boolean;
  /** Hides page-position controls that are not persisted by a template. */
  templateMode?: boolean;
  showStylePresets?: boolean;
  areaTranslateAvailable?: boolean;
  areaTranslateSelecting?: boolean;
  disableChapterApply?: boolean;
  selectedBlockCount?: number;
  selectionKey?: string;
  formatSelection?: PanelFormatSelection;
  /** Effective selection padding from the page session; `null` = mixed. */
  bubblePaddingRatio?: number | null;
  editorTextTabRequestToken?: number;
  editorTextResetToken?: number;
  pageSize?: { width: number; height: number } | null;
  /** Actual base size currently rendered on the source page, in page pixels. */
  resolvedFontSizePx?: number | null;
  transformMode?: TransformEditorMode;
  canCreateStylePreset?: boolean;
  stylePresets?: readonly BlockStylePresetSummary[];
  /** Optional actions (e.g. float/dock toggle) rendered in the panel header. */
  headerActions?: React.ReactNode;
  onStartAreaTranslate?: () => void;
  onApplyFormat?: (
    scope: FormatApplyScope,
    groupIds: BlockFormatGroupId[],
  ) => void;
  onApplyStylePreset?: (presetId: string) => void;
  onCreateStylePreset?: (
    input: CreateBlockStylePresetInput,
  ) => boolean | Promise<boolean>;
  onDeleteStylePreset?: (presetId: string) => boolean | Promise<boolean>;
  onOpenStylePresetManager?: () => void;
  onOpenFontManager?: () => void;
  onOverwriteStylePreset?: (presetId: string) => boolean | Promise<boolean>;
  onRenameStylePreset?: (
    presetId: string,
    name: string,
  ) => boolean | Promise<boolean>;
  onApplyBlockBackgroundOpacity?: (scope: BlockBackgroundApplyScope) => void;
  onAdjustFontSize: (adjustment: -1 | 1) => void;
  onUpdate: (patch: Partial<TranslationBlock>) => void;
  onPreviewTextSelection?: (selection: PanelTextSelection) => void;
  onUpdateFormat?: (patch: Partial<TranslationBlock>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSaveToLibrary?: () => void;
  onSuggestConsistentEdit?: (find: string, replace: string) => void;
  aiUnavailable?: boolean;
  onEraseOriginal?: () => void;
  onFitBubble?: () => void;
  /** Selection-wide bubble re-detection; absent without a live page. */
  onApplyBubblePadding?: (paddingRatio: number) => void;
  onRemoveBubbleLayout?: () => void;
  onSelectTransformMode?: (mode: TransformEditorMode) => void;
};

export type SelectedEditorPanelProps = EditorPanelProps & {
  block: TranslationBlock;
};

export type AppliedStylePresetSelection = {
  activePresetId: string;
  apply: (presetId: string) => void;
  clear: () => void;
  delete: (presetId: string) => Promise<boolean>;
};
