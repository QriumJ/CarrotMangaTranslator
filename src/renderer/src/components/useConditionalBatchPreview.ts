import React from "react";

import {
  createConditionalBatchPreview,
  createConditionalBatchSequencePreview,
} from "../../../shared/conditionalBatchEngine";

import {
  type ConditionalBatchPreview,
  type ConditionalBatchPreviewResult,
  type ConditionalBatchScope,
  type ConditionalBatchSequenceV2,
  type ConditionalBatchSnapshotV2,
} from "../../../shared/conditionalBatchRules";

import { type ConditionalBatchParsedDraft } from "./conditionalBatchSchemeDrafts";

import { useConditionalBatchTypography } from "./useConditionalBatchTypography";

import {
  ConditionalBatchEditorModelProps,
  ConditionalBatchScopeKind,
  PreviewMode,
} from "./conditionalBatchEditorTypes";

import {
  createPreviewWorkspaceView,
  usePreviewWorkspaceState,
} from "./conditionalBatchPreviewWorkspace";

// Scope, exclusions, preview state and result navigation are intentionally one
// state machine: a regenerated preview prunes stale exclusions and selection.
export function usePreviewController(
  props: ConditionalBatchEditorModelProps,
  parsedDraft: ConditionalBatchParsedDraft,
  typography: ReturnType<typeof useConditionalBatchTypography>,
  activeSequence: ConditionalBatchSequenceV2 | null,
  snapshot: ConditionalBatchSnapshotV2,
  schemeKey: string,
) {
  const { onSelectPage, selectedPageId } = props;
  const previewWorkspaceState = usePreviewWorkspaceState();
  const { scopeKind, setScopeKind, setScopePageId, scope } =
    usePreviewScope(props);
  const [previewMode, setPreviewMode] = React.useState<PreviewMode>("after");
  const [excludedByScheme, setExcludedByScheme] = React.useState<
    Readonly<Record<string, ReadonlySet<string>>>
  >({});
  const excludedResultKeys = excludedByScheme[schemeKey] ?? EMPTY_RESULT_KEYS;
  const [currentResultKey, setCurrentResultKey] = React.useState<string | null>(
    null,
  );
  const { preview, sequencePreview } = useResolvedPreview(
    props,
    parsedDraft,
    typography,
    activeSequence,
    snapshot,
    scope,
  );

  useReconcilePreviewSelection(
    preview,
    schemeKey,
    typography.ready,
    setExcludedByScheme,
    setCurrentResultKey,
  );

  const { currentResult, currentResultIndex, includedCount } =
    resolvePreviewSelection(preview, currentResultKey, excludedResultKeys);

  const activateResult = useActivatePreviewResult(
    onSelectPage,
    selectedPageId,
    setCurrentResultKey,
  );

  const actions = createPreviewActions(
    props,
    preview,
    currentResultIndex,
    activateResult,
    selectedPageId,
    schemeKey,
    setScopeKind,
    setScopePageId,
    setExcludedByScheme,
  );

  const view = createPreviewWorkspaceView({
    activateResult,
    currentResult,
    excludedResultKeys,
    preview,
    previewMode,
    previewWorkspaceState,
    props,
  });
  return {
    ...actions,
    activateResult: (result: ConditionalBatchPreviewResult) =>
      activateResult(result),
    currentResult,
    currentResultIndex,
    excludedResultKeys,
    includedCount,
    preview,
    previewMode,
    scopeKind,
    sequencePreview,
    setPreviewMode,
    ...view,
  };
}

function resolveScope(
  kind: ConditionalBatchScopeKind,
  pageId: string,
  blockIds: readonly string[],
): ConditionalBatchScope {
  if (kind === "chapter") return { kind: "chapter" };
  if (kind === "selection" && blockIds.length > 0) {
    return { kind: "selection", pageId, blockIds: [...blockIds] };
  }
  return { kind: "page", pageId };
}

function usePreviewScope(props: ConditionalBatchEditorModelProps) {
  const [scopeKind, setScopeKind] = React.useState<ConditionalBatchScopeKind>(
    props.selectedBlockIds?.length ? "selection" : "page",
  );
  const [scopePageId, setScopePageId] = React.useState(props.selectedPageId);
  const scope = React.useMemo(
    () => resolveScope(scopeKind, scopePageId, props.selectedBlockIds ?? []),
    [props.selectedBlockIds, scopeKind, scopePageId],
  );
  return { scopeKind, setScopeKind, setScopePageId, scope };
}

function emptyPreview(chapterId: string): ConditionalBatchPreview {
  return {
    chapterId,
    matchedCount: 0,
    matchedResultKeys: [],
    unchangedMatchCount: 0,
    inspectionOnly: false,
    results: [],
  };
}

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false;
  return [...left].every((value) => right.has(value));
}

const EMPTY_RESULT_KEYS: ReadonlySet<string> = new Set();

function useResolvedPreview(
  props: ConditionalBatchEditorModelProps,
  parsedDraft: ConditionalBatchParsedDraft,
  typography: ReturnType<typeof useConditionalBatchTypography>,
  activeSequence: ConditionalBatchSequenceV2 | null,
  snapshot: ConditionalBatchSnapshotV2,
  scope: ConditionalBatchScope,
) {
  const sequencePreview = React.useMemo(
    () =>
      activeSequence && typography.ready
        ? createConditionalBatchSequencePreview(
            props.chapter,
            scope,
            activeSequence,
            snapshot,
            typography.options,
          )
        : null,
    [
      activeSequence,
      typography.options,
      typography.ready,
      props.chapter,
      scope,
      snapshot,
    ],
  );
  const preview = React.useMemo(() => {
    if (sequencePreview) return sequencePreview.preview;
    return parsedDraft.success && typography.ready
      ? createConditionalBatchPreview(
          props.chapter,
          scope,
          parsedDraft.data,
          typography.options,
        )
      : emptyPreview(props.chapter.id);
  }, [
    typography.options,
    typography.ready,
    parsedDraft,
    props.chapter,
    scope,
    sequencePreview,
  ]);
  return { preview, sequencePreview };
}

function useReconcilePreviewSelection(
  preview: ConditionalBatchPreview,
  schemeKey: string,
  ready: boolean,
  setExcludedByScheme: React.Dispatch<
    React.SetStateAction<Readonly<Record<string, ReadonlySet<string>>>>
  >,
  setCurrentResultKey: React.Dispatch<React.SetStateAction<string | null>>,
) {
  React.useEffect(() => {
    if (!ready) return;
    const availableKeys = new Set(preview.results.map((result) => result.key));
    setExcludedByScheme((current) => {
      const currentKeys = current[schemeKey] ?? EMPTY_RESULT_KEYS;
      const next = new Set(
        [...currentKeys].filter((key) => availableKeys.has(key)),
      );
      return setsEqual(currentKeys, next)
        ? current
        : { ...current, [schemeKey]: next };
    });
    setCurrentResultKey((current) =>
      current && availableKeys.has(current)
        ? current
        : (preview.results[0]?.key ?? null),
    );
  }, [preview, schemeKey, ready, setCurrentResultKey, setExcludedByScheme]);
}

function createPreviewActions(
  props: ConditionalBatchEditorModelProps,
  preview: ConditionalBatchPreview,
  currentResultIndex: number,
  activateResult: (result: ConditionalBatchPreviewResult | null) => void,
  selectedPageId: string,
  schemeKey: string,
  setScopeKind: React.Dispatch<React.SetStateAction<ConditionalBatchScopeKind>>,
  setScopePageId: React.Dispatch<React.SetStateAction<string>>,
  setExcludedByScheme: React.Dispatch<
    React.SetStateAction<Readonly<Record<string, ReadonlySet<string>>>>
  >,
) {
  const moveResult = (offset: number): void => {
    if (preview.results.length === 0) return;
    const nextIndex =
      (currentResultIndex + offset + preview.results.length) %
      preview.results.length;
    activateResult(preview.results[nextIndex] ?? null);
  };
  const changeScope = (next: ConditionalBatchScopeKind): void => {
    if (next === "selection" && !props.selectedBlockIds?.length) return;
    setScopeKind(next);
    if (next !== "chapter") setScopePageId(selectedPageId);
  };
  const toggleResult = (key: string, included: boolean): void => {
    setExcludedByScheme((current) => {
      const next = new Set(current[schemeKey] ?? EMPTY_RESULT_KEYS);
      if (included) next.delete(key);
      else next.add(key);
      return { ...current, [schemeKey]: next };
    });
  };
  const setAllResultsIncluded = (included: boolean): void => {
    setExcludedByScheme((current) => ({
      ...current,
      [schemeKey]: included
        ? new Set<string>()
        : new Set(preview.results.map((result) => result.key)),
    }));
  };
  return { moveResult, changeScope, toggleResult, setAllResultsIncluded };
}

function resolvePreviewSelection(
  preview: ConditionalBatchPreview,
  currentResultKey: string | null,
  excludedResultKeys: ReadonlySet<string>,
) {
  const currentResultIndex = Math.max(
    0,
    preview.results.findIndex((result) => result.key === currentResultKey),
  );
  const currentResult = preview.results[currentResultIndex] ?? null;
  const includedCount = preview.results.reduce(
    (count, result) => count + (excludedResultKeys.has(result.key) ? 0 : 1),
    0,
  );
  return { currentResult, currentResultIndex, includedCount };
}

function useActivatePreviewResult(
  onSelectPage: (pageId: string) => void,
  selectedPageId: string,
  setCurrentResultKey: React.Dispatch<React.SetStateAction<string | null>>,
) {
  const activateResult = React.useCallback(
    (result: ConditionalBatchPreviewResult | null) => {
      if (!result) return;
      setCurrentResultKey(result.key);
      if (result.pageId !== selectedPageId) onSelectPage(result.pageId);
    },
    [onSelectPage, selectedPageId, setCurrentResultKey],
  );
  return activateResult;
}
