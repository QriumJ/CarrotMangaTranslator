import React from "react";

import { createConditionalBatchPreviewPage } from "../../../shared/conditionalBatchEngine";

import {
  type ConditionalBatchPreview,
  type ConditionalBatchPreviewResult,
} from "../../../shared/conditionalBatchRules";

import { createWorkspaceInteractionPreviewStore } from "../lib/workspaceInteractionPreview";

import type { WorkspaceZoomController } from "../lib/workspaceZoom";

import type { AppWorkspaceProps } from "./appWorkspaceTypes";

import {
  ConditionalBatchEditorModelProps,
  PreviewMode,
} from "./conditionalBatchEditorTypes";

type PreviewWorkspaceState = Pick<
  AppWorkspaceProps,
  | "imageRef"
  | "interactionPreviewStore"
  | "stageRef"
  | "workspacePanelRef"
  | "workspaceZoomControllerRef"
>;

export function usePreviewWorkspaceState(): PreviewWorkspaceState {
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const workspacePanelRef = React.useRef<HTMLElement | null>(null);
  const workspaceZoomControllerRef =
    React.useRef<WorkspaceZoomController | null>(null);
  const [interactionPreviewStore] = React.useState(
    createWorkspaceInteractionPreviewStore,
  );
  return {
    imageRef,
    interactionPreviewStore,
    stageRef,
    workspacePanelRef,
    workspaceZoomControllerRef,
  };
}

export function createPreviewWorkspaceView({
  activateResult,
  currentResult,
  excludedResultKeys,
  preview,
  previewMode,
  previewWorkspaceState,
  props,
}: {
  activateResult: (result: ConditionalBatchPreviewResult | null) => void;
  currentResult: ConditionalBatchPreviewResult | null;
  excludedResultKeys: ReadonlySet<string>;
  preview: ConditionalBatchPreview;
  previewMode: PreviewMode;
  previewWorkspaceState: PreviewWorkspaceState;
  props: ConditionalBatchEditorModelProps;
}): {
  previewWorkspaceProps: AppWorkspaceProps;
  selectedPageName: string;
} {
  const selectedPage =
    props.chapter.pages.find((page) => page.id === props.selectedPageId) ??
    props.chapter.pages[0] ??
    null;
  const previewPage = selectedPage
    ? createConditionalBatchPreviewPage(
        selectedPage,
        preview,
        excludedResultKeys,
        previewMode === "after",
      )
    : null;
  const highlightedBlockIds = preview.results
    .filter(
      (result) =>
        result.pageId === selectedPage?.id &&
        !excludedResultKeys.has(result.key),
    )
    .map((result) => result.blockId);
  return {
    selectedPageName: selectedPage?.name ?? "",
    previewWorkspaceProps: {
      ...props.workspaceProps,
      ...previewWorkspaceState,
      selectedPage: previewPage,
      selectedBlockId:
        currentResult?.pageId === selectedPage?.id
          ? currentResult.blockId
          : null,
      selectedBlockIds: highlightedBlockIds,
      showBlockChrome: true,
      showTextBlocks: true,
      showingOriginalPeek: false,
      jobActive: true,
      stageTool: "select",
      stageToolbarHidden: true,
      maskStrokes: [],
      regionSelectionActive: false,
      regionSelectionRect: null,
      originalImageOpacity: 0,
      originalImageOpacityAvailable: false,
      onBlockPointerDown: (event, block) => {
        event.preventDefault();
        event.stopPropagation();
        activateResult(
          preview.results.find(
            (result) =>
              result.pageId === selectedPage?.id && result.blockId === block.id,
          ) ?? null,
        );
      },
      onEffectiveScaleChange: undefined,
    },
  };
}
