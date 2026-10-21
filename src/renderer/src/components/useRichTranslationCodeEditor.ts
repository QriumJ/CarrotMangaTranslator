import type { TextStylePatch } from "../../../shared/richTextMarkup";
import { applyCodeTypingStyle } from "./richTranslationCodeFormatting";
import React from "react";
import type { RichTextEditorSelection } from "../lib/richTextEditorDom";
import type { InlineMarkupResult } from "../lib/textareaMarkup";
import type { RichTranslationEditorMode } from "./richTranslationEditorTypes";

type RichTranslationCodeEditorArgs = {
  clearTypingStyle: () => void;
  typingOffsetRef: React.MutableRefObject<number | null>;
  typingStyleRef: React.MutableRefObject<TextStylePatch | null>;
  mode: RichTranslationEditorMode;
  onChange: (value: string) => void;
  setSelection: (selection: RichTextEditorSelection) => void;
  value: string;
};

export type RichTranslationCodeEditor = {
  onInputChange: (value: string, composing?: boolean) => void;
  codeRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  commitResult: (result: InlineMarkupResult) => void;
  onSelect: React.ReactEventHandler<HTMLTextAreaElement>;
};

export function useRichTranslationCodeEditor({
  typingStyleRef,
  typingOffsetRef,
  clearTypingStyle,
  mode,
  onChange,
  setSelection,
  value,
}: RichTranslationCodeEditorArgs): RichTranslationCodeEditor {
  const completedComposition = React.useRef<string | null>(null);
  const compositionValue = React.useRef<string | null>(null);
  const codeRef = React.useRef<HTMLTextAreaElement | null>(null);
  const pendingSelectionRef = React.useRef<RichTextEditorSelection | null>(
    null,
  );
  useRestoreCodeSelection(
    mode,
    value,
    codeRef,
    pendingSelectionRef,
    setSelection,
  );
  const commitResult = React.useCallback(
    (result: InlineMarkupResult): void => {
      const nextSelection = {
        start: result.selectionStart,
        end: result.selectionEnd,
      };
      pendingSelectionRef.current = nextSelection;
      typingOffsetRef.current = nextSelection.start;
      if (result.value === value && codeRef.current) {
        pendingSelectionRef.current = null;
        codeRef.current.focus();
        codeRef.current.setSelectionRange(
          nextSelection.start,
          nextSelection.end,
        );
      }
      onChange(result.value);
      setSelection(nextSelection);
    },
    [onChange, setSelection, typingOffsetRef, value],
  );
  const onSelect = useCodeSelectionHandler({
    compositionValue,
    typingStyleRef,
    typingOffsetRef,
    clearTypingStyle,
    setSelection,
  });
  const onInputChange = (next: string, composing = false): void => {
    if (composing) {
      compositionValue.current ??= value;
      onChange(next);
      return;
    }
    if (completedComposition.current === next) {
      completedComposition.current = null;
      return;
    }
    completedComposition.current =
      compositionValue.current !== null ? next : null;
    const result = applyCodeTypingStyle(
      compositionValue.current ?? value,
      next,
      typingStyleRef.current ?? null,
    );
    compositionValue.current = null;
    if (result) commitResult(result);
    else onChange(next);
  };
  return { codeRef, commitResult, onSelect, onInputChange };
}

function useCodeSelectionHandler({
  compositionValue,
  typingStyleRef,
  typingOffsetRef,
  clearTypingStyle,
  setSelection,
}: Pick<
  RichTranslationCodeEditorArgs,
  "typingStyleRef" | "typingOffsetRef" | "clearTypingStyle" | "setSelection"
> & {
  compositionValue: React.MutableRefObject<string | null>;
}): React.ReactEventHandler<HTMLTextAreaElement> {
  return React.useCallback<React.ReactEventHandler<HTMLTextAreaElement>>(
    (event) => {
      const next = {
        start: event.currentTarget.selectionStart,
        end: event.currentTarget.selectionEnd,
      };
      if (
        typingStyleRef.current &&
        compositionValue.current === null &&
        (next.start !== next.end || next.start !== typingOffsetRef.current)
      )
        clearTypingStyle();
      setSelection(next);
    },
    [
      setSelection,
      clearTypingStyle,
      typingOffsetRef,
      typingStyleRef,
      compositionValue,
    ],
  );
}

function useRestoreCodeSelection(
  mode: RichTranslationEditorMode,
  value: string,
  codeRef: React.RefObject<HTMLTextAreaElement | null>,
  pendingSelectionRef: React.MutableRefObject<RichTextEditorSelection | null>,
  setSelection: (selection: RichTextEditorSelection) => void,
): void {
  React.useLayoutEffect(() => {
    if (mode !== "code") return;
    const pending = pendingSelectionRef.current;
    const element = codeRef.current;
    if (!pending || !element) return;
    pendingSelectionRef.current = null;
    element.focus();
    element.setSelectionRange(pending.start, pending.end);
    // Focusing may emit select with the pre-serialization offsets. Publish the
    // restored range last so subsequent controls keep targeting the same text.
    setSelection(pending);
  }, [mode, value, codeRef, pendingSelectionRef, setSelection]);
}
