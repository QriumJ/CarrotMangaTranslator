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
import { formatGatheredTextFile } from "../../../../shared/gatherTextFile";

type GatherTextModalModelProps = Pick<
  GatherTextModalProps,
  | "chapter"
  | "blockStylePresets"
  | "page"
  | "onImportReviewText"
  | "onApplyTranslatedText"
  | "onApplyFormat"
  | "formatApplyDisabled"
  | "readingDirection"
>;
type TxtImportField = "both" | "translated";

export function useGatherTextModalModel({
  blockStylePresets,
  chapter,
  formatApplyDisabled,
  onApplyFormat,
  page,
  onImportReviewText,
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
  const [txtField, setTxtField] = React.useState<TxtImportField>("translated");
  const reviewFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const txtFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const { pages, text, fileText } = useGatheredTextContent({
    chapter,
    page,
    scope,
    readingDirection,
    field,
    excludeHeaders,
  });
  const fileActions = useGatherTextActions(
    text,
    buildDefaultName(chapter, page, scope),
    fileText,
  );
  const reviewActions = useReviewTextActions({
    chapter,
    onImportReviewText,
    setReviewBusy,
    setReviewWarnings,
  });
  const handleImportTxtFile = useTxtImportAction({
    chapter,
    page,
    scope,
    readingDirection,
    field: txtField,
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
    setTxtImportField: setTxtField,
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

function useGatheredTextContent({
  chapter,
  page,
  scope,
  readingDirection,
  field,
  excludeHeaders,
}: Pick<GatherTextModalProps, "chapter" | "page" | "readingDirection"> & {
  scope: GatherScope;
  field: GatherField;
  excludeHeaders: boolean;
}) {
  return React.useMemo(() => {
    const pages = filterPagesByField(
      gatherText({ chapter, page, scope, direction: readingDirection }),
      field,
    );
    return {
      pages,
      text: formatGatheredText(pages, field, !excludeHeaders),
      fileText: formatGatheredTextFile(pages, field, !excludeHeaders),
    };
  }, [chapter, page, scope, readingDirection, field, excludeHeaders]);
}
