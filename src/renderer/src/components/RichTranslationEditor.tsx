import { useEventCallback } from "../hooks/useEventCallback";
import { useRichTranslationOutputSelection } from "./useRichTranslationOutputSelection";
import React from "react";
import type { TranslationBlock } from "../../../shared/textTypes";
import {
  resolveControllerCharacterScope,
  resolveSelectionMixedFields,
  type CharacterFormatTarget,
  type CharacterFormatCommands,
} from "./editorCharacterFormatTarget";
import { resolveEditorSurfaceTone } from "../lib/textRunVisualStyles";
import { EditorTextSelectionCommands } from "./EditorTextSelectionCommands";
import { RichTranslationEditorView } from "./RichTranslationEditorView";
import {
  useRichTranslationEditorController,
  type RichTranslationEditorController,
} from "./useRichTranslationEditorController";

type RichTranslationEditorProps = {
  afterInput?: React.ReactNode;
  afterEditor?: React.ReactNode;
  renderCharacterFormat?: (target: CharacterFormatTarget) => React.ReactNode;
  onPreviewTextSelection?: (
    selection: import("../../../shared/panelBridgeTypes").PanelTextSelection,
  ) => void;
  block: TranslationBlock;
  disabled: boolean;
  editorRootRef: React.RefObject<HTMLDivElement | null>;
  heightRefCallback: (element: HTMLElement | null) => void;
  pageSize?: { width: number; height: number } | null;
  resolvedFontSizePx?: number | null;
  selectionKey?: string;
  textEditRequestToken?: number;
  textResetToken?: number;
  onChange: (value: string, patch?: Partial<TranslationBlock>) => void;
  value: string;
};

export function RichTranslationEditor(
  props: RichTranslationEditorProps,
): React.JSX.Element {
  const controller = useRichTranslationEditorController({
    block: props.block,
    editorRootRef: props.editorRootRef,
    onChange: props.onChange,
    value: props.value,
  });
  useEditingLifecycle(props, controller);
  const selectOutputLine = useRichTranslationOutputSelection(
    props.block,
    props.value,
    props.pageSize,
    props.resolvedFontSizePx,
    controller,
  );
  // Selecting text from the format controls opens a collapsed translation.
  const [selectionReveals, setSelectionReveals] = React.useState(0);
  const target = useControllerCharacterFormatTarget(
    controller,
    selectOutputLine,
    () => setSelectionReveals((count) => count + 1),
  );
  return (
    <RichTranslationEditorView
      afterInput={
        <>
          <EditorTextSelectionCommands
            commands={target.commands}
            disabled={props.disabled}
          />
          {props.afterInput}
        </>
      }
      afterEditor={props.afterEditor}
      characterFormat={props.renderCharacterFormat?.(target)}
      beginEditing={controller.beginEditing}
      endEditing={controller.endEditing}
      revealToken={(props.textEditRequestToken ?? 0) + selectionReveals}
      clearAllFormatting={controller.clearAllFormatting}
      codeRef={controller.code.codeRef}
      disabled={props.disabled}
      editorRootRef={props.editorRootRef}
      heightRefCallback={props.heightRefCallback}
      insertSpecialCharacter={controller.insertSpecialCharacter}
      mode={controller.mode}
      onChange={controller.code.onInputChange}
      onCodeSelect={controller.code.onSelect}
      plainText={controller.plainText}
      surfaceTone={resolveEditorSurfaceTone(props.block)}
      setMode={controller.setMode}
      specialCharactersId={controller.specialCharacters.id}
      specialCharactersOpen={controller.specialCharacters.open}
      toggleSpecialCharacters={controller.specialCharacters.toggle}
      value={props.value}
      visual={controller.visual}
    />
  );
}

/** Mirrors the active text range on the canvas and resets it on block switch. */
function useEditingLifecycle(
  props: RichTranslationEditorProps,
  controller: RichTranslationEditorController,
): void {
  const { onPreviewTextSelection, block, value } = props;
  React.useEffect(() => {
    onPreviewTextSelection?.({
      blockId: block.id,
      translatedText: value,
      start: controller.editingText ? controller.selection.start : 0,
      end: controller.editingText ? controller.selection.end : 0,
    });
    return () =>
      onPreviewTextSelection?.({
        blockId: block.id,
        translatedText: value,
        start: 0,
        end: 0,
      });
  }, [
    controller.editingText,
    controller.selection.start,
    controller.selection.end,
    onPreviewTextSelection,
    block.id,
    value,
  ]);
  const endEditing = useEventCallback(controller.endEditing);
  const focusEditor = useEventCallback(() => controller.selectTextRange(0, 0));
  React.useEffect(() => {
    endEditing();
  }, [endEditing, props.block.id, props.selectionKey, props.textResetToken]);
  React.useEffect(() => {
    if (props.textEditRequestToken) focusEditor();
  }, [focusEditor, props.textEditRequestToken]);
}

function useControllerCharacterFormatTarget(
  controller: RichTranslationEditorController,
  selectOutputLine: (() => void) | undefined,
  revealText: () => void,
): CharacterFormatTarget & { commands: CharacterFormatCommands } {
  const mixed = React.useMemo(
    () => resolveSelectionMixedFields(controller.selectionValues),
    [controller.selectionValues],
  );
  return {
    scope: resolveControllerCharacterScope(
      controller.editingText,
      controller.hasSelection,
    ),
    blockCount: 1,
    codeMode: controller.mode === "code",
    values: controller.selectionValues,
    mixed,
    supportsCharacterBackground: true,
    apply: controller.applyInlineStyle,
    commands: {
      editing: controller.editingText,
      selectAll: () => {
        revealText();
        controller.selectAll();
      },
      selectOutputLine: selectOutputLine
        ? () => {
            revealText();
            selectOutputLine();
          }
        : undefined,
      finishEditing: controller.endEditing,
    },
  };
}
