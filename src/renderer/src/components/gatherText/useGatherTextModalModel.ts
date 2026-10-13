import React from "react";
import {
  filterPagesByField,
  formatGatheredText,
  gatherText,
  type GatherField,
  type GatherScope,
} from "../../../../shared/gatherText";
import { useGatherTextSearch } from "../../hooks/useGatherTextSearch";
import { useWorkspacePreference } from "../../hooks/useWorkspacePreference";
import type { GatherTextModalProps } from "./gatherTextTypes";
import {
  buildDefaultName,
  useGatherTextActions,
  useTxtImportAction,
} from "./useGatherTextFileActions";
import { useReviewTextActions } from "./useReviewTextActions";
import { useGatherTextFormatSelection } from "./useGatherTextFormatSelection";

type GatherTextModalModelProps = Pick<
  GatherTextModalProps,
  | "chapter"
  | "blockStylePresets"
  | "page"
  | "onChapterUpdated"
  | "onApplyTranslatedText"
  | "onApplyFormat"
  | "formatApplyDisabled"
  | "readingDirection"
>;

export function useGatherTextModalModel({
  blockStylePresets,
  chapter,
  formatApplyDisabled,
  onApplyFormat,
  page,
  onChapterUpdated,
  onApplyTranslatedText,
  readingDirection = "rtl",
}: GatherTextModalModelProps) {
  const [scope, setScope] = React.useState<GatherScope>("page");
  // Scope stays per opening; the text view choices are remembered.
  const [field, setField] = useWorkspacePreference("gatherTextField");
  const [excludeHeaders, setExcludeHeaders] = useWorkspacePreference(
    "gatherTextExcludeHeaders",
  );
  const [reviewWarnings, setReviewWarnings] = React.useState<string[]>([]);
  const [reviewBusy, setReviewBusy] = React.useState(false);
  const reviewFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const txtFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const pages = React.useMemo(
    () =>
      filterPagesByField(
        gatherText({ chapter, page, scope, direction: readingDirection }),
        field,
      ),
    [chapter, field, page, readingDirection, scope],
  );
  const text = React.useMemo(
    () => formatGatheredText(pages, field, !excludeHeaders),
    [excludeHeaders, field, pages],
  );
  const fileActions = useGatherTextActions(
    text,
    buildDefaultName(chapter, page, scope),
  );
  const reviewActions = useReviewTextActions({
    chapter,
    onChapterUpdated,
    setReviewBusy,
    setReviewWarnings,
  });
  const handleImportTxtFile = useTxtImportAction({
    chapter,
    page,
    scope,
    readingDirection,
    onApplyTranslatedText,
    setReviewWarnings,
  });
  const formatSelection = useGatherTextFormatSelection({
    blockStylePresets,
    chapter,
    disabled: formatApplyDisabled ?? false,
    onApply: onApplyFormat,
    pages,
  });
  const formatControls = useGatherTextControlHandlers({
    clearSelection: formatSelection?.clear,
    setField,
    setScope,
  });
  return {
    scope,
    field,
    ...formatControls,
    excludeHeaders,
    setExcludeHeaders,
    reviewWarnings,
    reviewBusy,
    reviewFileInputRef,
    txtFileInputRef,
    pages,
    formatSelection,
    hasContent: pages.length > 0,
    search: useGatherTextSearch(pages, field),
    handleImportTxtFile,
    ...fileActions,
    ...reviewActions,
  };
}

function useGatherTextControlHandlers({
  clearSelection,
  setField,
  setScope,
}: {
  clearSelection?: () => void;
  setField: React.Dispatch<React.SetStateAction<GatherField>>;
  setScope: React.Dispatch<React.SetStateAction<GatherScope>>;
}) {
  const handleScopeChange = React.useCallback(
    (nextScope: GatherScope) => {
      clearSelection?.();
      setScope(nextScope);
    },
    [clearSelection, setScope],
  );
  const handleFieldChange = React.useCallback(
    (nextField: GatherField) => {
      clearSelection?.();
      setField(nextField);
    },
    [clearSelection, setField],
  );
  return { setScope: handleScopeChange, setField: handleFieldChange };
}
