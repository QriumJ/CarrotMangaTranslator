import React from "react";
import {
  parseRichText,
  type TextStylePatch,
} from "../../../shared/richTextMarkup";
import type { TranslationBlock } from "../../../shared/textTypes";
import { useFonts } from "../fonts/useFonts";
import {
  restoreRichTextEditorSelection,
  type RichTextEditorRenderOptions,
} from "../lib/richTextEditorDom";
import { resolveBlockFontFamily, type BlockFontCatalog } from "../lib/fonts";
import type { RichTranslationEditorMode } from "./richTranslationEditorTypes";
import {
  normalizeRichTextOpacity,
  resolveRichTranslationCodeSelection,
  resolveRichTranslationSelectionValues,
} from "./richTranslationSelectionModel";
import {
  useRichTranslationCodeEditor,
  type RichTranslationCodeEditor,
} from "./useRichTranslationCodeEditor";
import { useRichTranslationEditorActions } from "./useRichTranslationEditorActions";
import {
  useRichTranslationEditorState,
  type RichTranslationSelectionState,
} from "./useRichTranslationEditorState";
import { useRichTranslationSpecialCharacters } from "./useRichTranslationSpecialCharacters";
import {
  useRichTranslationVisualEditor,
  type RichTranslationVisualEditor,
} from "./useRichTranslationVisualEditor";

const EDITOR_MODE_STORAGE_KEY = "editor.richText.mode";

type RichTranslationEditorControllerArgs = {
  block: TranslationBlock;
  editorRootRef: React.RefObject<HTMLDivElement | null>;
  onChange: (value: string, patch?: Partial<TranslationBlock>) => void;
  value: string;
};

export type RichTranslationEditorController = {
  editingText: boolean;
  beginEditing: () => void;
  endEditing: () => void;
  selectAll: () => void;
  selectTextRange: (start: number, end: number) => void;
  selection: { start: number; end: number };
  applyInlineStyle: (patch: TextStylePatch) => void;
  clearAllFormatting: () => void;
  code: RichTranslationCodeEditor;
  insertSpecialCharacter: (character: string) => void;
  mode: RichTranslationEditorMode;
  plainText: string;
  hasSelection: boolean;
  selectionValues: ReturnType<typeof resolveRichTranslationSelectionValues>;
  setMode: (mode: RichTranslationEditorMode) => void;
  specialCharacters: ReturnType<typeof useRichTranslationSpecialCharacters>;
  visual: RichTranslationVisualEditor;
};

export function useRichTranslationEditorController({
  block,
  editorRootRef,
  onChange: publishChange,
  value,
}: RichTranslationEditorControllerArgs): RichTranslationEditorController {
  const { catalog } = useFonts();
  const [editingText, setEditingText] = React.useState(false);
  const { onChange, pendingPatch } = usePatchedChange(publishChange);
  const parsed = React.useMemo(() => parseRichText(value), [value]);
  const renderOptions = useRichTextRenderOptions(block, catalog);
  const state = useRichTranslationEditorState(block.id);
  const [mode, setModeState] =
    React.useState<RichTranslationEditorMode>(readStoredMode);
  const specialCharacters = useRichTranslationSpecialCharacters(
    block.id,
    editorRootRef,
  );
  const code = useRichTranslationCodeEditor({
    typingStyleRef: state.typingStyleRef,
    typingOffsetRef: state.typingOffsetRef,
    clearTypingStyle: state.clearTypingStyle,
    mode,
    onChange,
    setSelection: state.setSelection,
    value,
  });
  const visual = useRichTranslationVisualEditor({
    blockId: block.id,
    mode,
    onChange,
    renderOptions,
    runs: parsed.runs,
    selectionState: state,
    value,
  });
  const actionArgs = {
    editingText,
    pendingPatch,
    block,
    code,
    mode,
    onChange,
    parsed,
    state,
    value,
    visual,
  };
  return {
    editingText,
    selectAll: createSelectAll({ ...actionArgs, setEditingText }),
    ...useTextEditingCommands(state, visual, setEditingText, setModeState),
    selection:
      mode === "visual"
        ? state.selection
        : resolveRichTranslationCodeSelection(
            value,
            state.selection,
            parsed.plainText.length,
          ),
    ...useRichTranslationEditorActions(actionArgs, specialCharacters.close),
    code,
    mode,
    plainText: parsed.plainText,
    hasSelection: state.selection.start !== state.selection.end,
    selectionValues: useSelectionValues(
      block,
      mode,
      parsed,
      state,
      value,
      editingText,
    ),
    setMode: useSetEditorMode(setModeState, state, specialCharacters.close),
    specialCharacters,
    visual,
  };
}

function createSelectAll({
  state,
  code,
  visual,
  mode,
  value,
  parsed,
  setEditingText,
}: {
  state: RichTranslationSelectionState;
  code: RichTranslationCodeEditor;
  visual: RichTranslationVisualEditor;
  mode: RichTranslationEditorMode;
  value: string;
  parsed: ReturnType<typeof parseRichText>;
  setEditingText: (editing: boolean) => void;
}): () => void {
  return () => {
    state.clearTypingStyle();
    setEditingText(true);
    if (mode === "code")
      code.commitResult({
        value,
        selectionStart: 0,
        selectionEnd: value.length,
      });
    else {
      state.setSelection({ start: 0, end: parsed.plainText.length });
      focusVisualRange(visual, { start: 0, end: parsed.plainText.length });
    }
  };
}

/** Carries an optional block patch with the next text change, atomically. */
function usePatchedChange(
  publishChange: (value: string, patch?: Partial<TranslationBlock>) => void,
): {
  onChange: (next: string) => void;
  pendingPatch: React.MutableRefObject<Partial<TranslationBlock> | undefined>;
} {
  const pendingPatch = React.useRef<Partial<TranslationBlock> | undefined>(
    undefined,
  );
  const onChange = React.useCallback(
    (next: string) => {
      const patch = pendingPatch.current;
      pendingPatch.current = undefined;
      if (patch && Object.keys(patch).length) publishChange(next, patch);
      else publishChange(next);
    },
    [publishChange],
  );
  return { onChange, pendingPatch };
}

/** Enter, leave or retarget text editing; leaving returns to block scope. */
function useTextEditingCommands(
  state: RichTranslationSelectionState,
  visual: RichTranslationVisualEditor,
  setEditingText: (editing: boolean) => void,
  setMode: (mode: RichTranslationEditorMode) => void,
): Pick<
  RichTranslationEditorController,
  "beginEditing" | "endEditing" | "selectTextRange"
> {
  const rootRef = visual.visualRef;
  React.useEffect(() => () => cancelVisualFocus(rootRef), [rootRef]);
  return {
    beginEditing: () => setEditingText(true),
    endEditing: () => {
      cancelVisualFocus(visual.visualRef);
      setEditingText(false);
      state.clearTypingStyle();
      state.setSelection({ start: 0, end: 0 });
    },
    selectTextRange: (start, end) => {
      state.clearTypingStyle();
      state.setSelection({ start, end });
      setEditingText(true);
      setMode("visual");
      focusVisualRange(visual, { start, end });
    },
  };
}

const pendingVisualFocus = new WeakMap<object, number>();
function cancelVisualFocus(rootRef: object): void {
  const pending = pendingVisualFocus.get(rootRef);
  if (pending !== undefined) cancelAnimationFrame(pending);
  pendingVisualFocus.delete(rootRef);
}

function focusVisualRange(
  visual: RichTranslationVisualEditor,
  selection: { start: number; end: number },
): void {
  cancelVisualFocus(visual.visualRef);
  const request = requestAnimationFrame(() => {
    pendingVisualFocus.delete(visual.visualRef);
    const root = visual.visualRef.current;
    if (!root) return;
    root.focus();
    restoreRichTextEditorSelection(root, selection);
  });
  pendingVisualFocus.set(visual.visualRef, request);
}

function useRichTextRenderOptions(
  block: TranslationBlock,
  catalog: BlockFontCatalog,
): RichTextEditorRenderOptions {
  return React.useMemo(
    () => ({
      block,
      baseBold: Boolean(block.bold),
      baseItalic: Boolean(block.italic),
      baseFontSizePx: block.fontSizePx,
      baseFontFamily: resolveBlockFontFamily(block.fontFamily, catalog),
      baseOpacity: normalizeRichTextOpacity(block.textOpacity),
      resolveFontFamily: (fontId: string | undefined) =>
        resolveBlockFontFamily(fontId ?? block.fontFamily, catalog),
    }),
    [block, catalog],
  );
}

function useSetEditorMode(
  setMode: React.Dispatch<React.SetStateAction<RichTranslationEditorMode>>,
  state: RichTranslationSelectionState,
  closeSpecialCharacters: () => void,
): (mode: RichTranslationEditorMode) => void {
  return React.useCallback(
    (next) => {
      setMode(next);
      closeSpecialCharacters();
      state.setSelection({ start: 0, end: 0 });
      state.setCaretRun(null);
      state.clearTypingStyle();
      window.localStorage.setItem(EDITOR_MODE_STORAGE_KEY, next);
    },
    [closeSpecialCharacters, setMode, state],
  );
}

function useSelectionValues(
  block: TranslationBlock,
  mode: RichTranslationEditorMode,
  parsed: ReturnType<typeof parseRichText>,
  state: RichTranslationSelectionState,
  value: string,
  editingText: boolean,
): ReturnType<typeof resolveRichTranslationSelectionValues> {
  return React.useMemo(() => {
    const resolvedSelection =
      mode === "visual"
        ? state.selection
        : resolveRichTranslationCodeSelection(
            value,
            state.selection,
            parsed.plainText.length,
          );
    return resolveRichTranslationSelectionValues(
      parsed.runs,
      editingText
        ? resolvedSelection
        : { start: 0, end: parsed.plainText.length },
      block,
      mode === "visual" ? state.caretRun : null,
      editingText ? state.typingStyle : null,
    );
  }, [block, mode, parsed, state, value, editingText]);
}

function readStoredMode(): RichTranslationEditorMode {
  if (typeof window === "undefined") return "visual";
  return window.localStorage.getItem(EDITOR_MODE_STORAGE_KEY) === "code"
    ? "code"
    : "visual";
}
