import type { BlockStylePreset } from "../../../shared/blockStylePresets";

import { type ConditionalBatchEngineOptions } from "../../../shared/conditionalBatchEngine";

import {
  type ConditionalBatchApplyResult,
  type ConditionalBatchPreview,
  type ConditionalBatchSchemeDraftV2,
  type ConditionalBatchSequencePreview,
  type ConditionalBatchSequenceV2,
  type ConditionalBatchSnapshotV2,
} from "../../../shared/conditionalBatchRules";

import type { ChapterSnapshot } from "../../../shared/libraryTypes";

import type { AppWorkspaceProps } from "./appWorkspaceTypes";

import type { ConditionalBatchFooterProps } from "./ConditionalBatchFooter";

import type { ConditionalBatchPreviewPaneProps } from "./ConditionalBatchPreviewPane";

import type { ConditionalBatchResultsCardProps } from "./ConditionalBatchResultsCard";

import type { ConditionalBatchRulePanelProps } from "./conditionalBatchRulePanelTypes";

export type ConditionalBatchScopeKind = "selection" | "page" | "chapter";

export type PreviewMode = "before" | "after";

export type ConditionalBatchEditorModelProps = {
  blockStylePresets?: readonly BlockStylePreset[];
  chapter: ChapterSnapshot;
  initialFind?: string;
  initialReplace?: string;
  selectedBlockIds?: readonly string[];
  selectedPageId: string;
  workId?: string;
  workspaceProps: AppWorkspaceProps;
  busy: boolean;
  canUndo: boolean;
  undoLabel: string | null;
  onApply: (
    scheme: ConditionalBatchSchemeDraftV2,
    preview: ConditionalBatchPreview,
    excludedResultKeys: ReadonlySet<string>,
    options?: ConditionalBatchEngineOptions,
  ) => Omit<ConditionalBatchApplyResult, "chapter">;
  onApplySequence?: (
    sequence: ConditionalBatchSequenceV2,
    snapshot: ConditionalBatchSnapshotV2,
    preview: ConditionalBatchSequencePreview,
    excludedResultKeys: ReadonlySet<string>,
    options?: ConditionalBatchEngineOptions,
  ) => Omit<ConditionalBatchApplyResult, "chapter">;
  onClose: () => void;
  onSelectPage: (pageId: string) => void;
  onUndo: () => Promise<boolean>;
};

export type ConditionalBatchEditorModel = {
  footerProps: ConditionalBatchFooterProps;
  close: () => void;
  hasDirtyTemporaryDrafts: boolean;
  previewPaneProps: ConditionalBatchPreviewPaneProps;
  resultsProps: ConditionalBatchResultsCardProps;
  rulePanelProps: ConditionalBatchRulePanelProps;
};
