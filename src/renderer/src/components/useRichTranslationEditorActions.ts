import {
  applyBlockCharacterFormat,
  applySelectionCharacterFormat,
} from "../../../shared/richTextBlockFormatting";
import React from "react";
import {
  parseRichText,
  type TextStylePatch,
} from "../../../shared/richTextMarkup";
import type { TranslationBlock } from "../../../shared/textTypes";
import {
  insertPlainTextAtEditorSelection,
  restoreRichTextEditorSelection,
} from "../lib/richTextEditorDom";
import { serializeCodeSelection } from "./richTranslationCodeFormatting";
import { resolveRichTranslationCodeSelection } from "./richTranslationSelectionModel";
import type { RichTranslationEditorMode } from "./richTranslationEditorTypes";
import type { RichTranslationCodeEditor } from "./useRichTranslationCodeEditor";
import type { RichTranslationSelectionState } from "./useRichTranslationEditorState";
import type { RichTranslationVisualEditor } from "./useRichTranslationVisualEditor";

export type RichTranslationActionArgs = {
  editingText: boolean;
  pendingPatch: React.MutableRefObject<Partial<TranslationBlock> | undefined>;
  block: TranslationBlock;
  code: RichTranslationCodeEditor;
  mode: RichTranslationEditorMode;
  onChange: (value: string) => void;
  parsed: ReturnType<typeof parseRichText>;
  state: RichTranslationSelectionState;
  value: string;
  visual: RichTranslationVisualEditor;
};

/** Formatting, reset and symbol insertion against the controller's target. */
export function useRichTranslationEditorActions(
  args: RichTranslationActionArgs,
  closeSpecialCharacters: () => void,
): {
  applyInlineStyle: (patch: TextStylePatch) => void;
  clearAllFormatting: () => void;
  insertSpecialCharacter: (character: string) => void;
} {
  return {
    applyInlineStyle: useApplyInlineStyle(args),
    clearAllFormatting: useClearAllFormatting(args),
    insertSpecialCharacter: useInsertSpecialCharacter({
      ...args,
      close: closeSpecialCharacters,
    }),
  };
}

function useApplyInlineStyle({
  block,
  editingText,
  pendingPatch,
  onChange,
  code,
  mode,
  parsed,
  state,
  value,
  visual,
}: RichTranslationActionArgs): (patch: TextStylePatch) => void {
  return React.useCallback(
    (patch) => {
      if (!editingText) {
        const result = applyBlockCharacterFormat(
          { ...block, translatedText: value },
          patch,
        );
        const { translatedText, ...rest } = result;
        pendingPatch.current = rest;
        onChange(translatedText ?? value);
        return;
      }
      const target = state.selectionRef.current;
      if (mode === "visual") {
        if (target.end <= target.start) {
          const materialized = applySelectionCharacterFormat(
            block,
            parsed.runs,
            0,
            0,
            patch,
          );
          if (Object.keys(materialized.blockPatch).length) {
            pendingPatch.current = materialized.blockPatch;
            visual.commitRuns(materialized.runs);
          }
          state.updateTypingStyle(patch);
          return;
        }
        state.clearTypingStyle();
        const result = applySelectionCharacterFormat(
          block,
          parsed.runs,
          target.start,
          target.end,
          patch,
        );
        pendingPatch.current = result.blockPatch;
        visual.commitRuns(result.runs);
        return;
      }
      applyCodeSelectionStyle(
        { block, parsed, state, pendingPatch, code, value },
        patch,
      );
    },
    [
      block,
      editingText,
      pendingPatch,
      onChange,
      code,
      mode,
      parsed,
      state,
      value,
      visual,
    ],
  );
}

function applyCodeSelectionStyle(
  {
    block,
    parsed,
    state,
    pendingPatch,
    code,
    value,
  }: Pick<
    RichTranslationActionArgs,
    "block" | "parsed" | "state" | "pendingPatch" | "code" | "value"
  >,
  patch: TextStylePatch,
): void {
  const target = state.selectionRef.current;
  const range = resolveRichTranslationCodeSelection(
    value,
    target,
    parsed.plainText.length,
  );
  const result = applySelectionCharacterFormat(
    block,
    parsed.runs,
    range.start,
    range.end,
    patch,
  );
  pendingPatch.current = result.blockPatch;
  if (range.start === range.end) {
    if (Object.keys(result.blockPatch).length) {
      code.commitResult(serializeCodeSelection(result.runs, range));
    }
    state.updateTypingStyle(patch);
    return;
  }
  state.clearTypingStyle();
  code.commitResult(serializeCodeSelection(result.runs, range));
}

function useClearAllFormatting({
  code,
  mode,
  parsed,
  state,
  visual,
}: RichTranslationActionArgs): () => void {
  return React.useCallback(() => {
    const nextSelection = {
      start: Math.min(state.selection.start, parsed.plainText.length),
      end: Math.min(state.selection.end, parsed.plainText.length),
    };
    if (mode === "visual") {
      visual.commitRuns(parseRichText(parsed.plainText).runs, nextSelection);
      return;
    }
    code.commitResult({
      value: parsed.plainText,
      selectionStart: nextSelection.start,
      selectionEnd: nextSelection.end,
    });
  }, [code, mode, parsed.plainText, state.selection, visual]);
}

function useInsertSpecialCharacter(
  args: RichTranslationActionArgs & { close: () => void },
): (character: string) => void {
  return React.useCallback(
    (character) => {
      args.close();
      if (args.mode === "visual") {
        insertVisualCharacter(character, args);
        return;
      }
      const codeElement = args.code.codeRef.current;
      const start = codeElement
        ? Math.min(codeElement.selectionStart, codeElement.selectionEnd)
        : args.state.selectionRef.current.start;
      const end = codeElement
        ? Math.max(codeElement.selectionStart, codeElement.selectionEnd)
        : args.state.selectionRef.current.end;
      const caret = start + character.length;
      args.code.commitResult({
        value: `${args.value.slice(0, start)}${character}${args.value.slice(end)}`,
        selectionStart: caret,
        selectionEnd: caret,
      });
    },
    [args],
  );
}

function insertVisualCharacter(
  character: string,
  args: RichTranslationActionArgs,
): void {
  const root = args.visual.visualRef.current;
  if (!root) return;
  const current = args.state.selectionRef.current;
  root.focus();
  restoreRichTextEditorSelection(root, current);
  args.state.beforeInputRef.current = {
    selection: current,
    style: args.state.typingStyleRef.current,
  };
  if (insertPlainTextAtEditorSelection(root, character)) {
    args.visual.commitInput();
  }
}
