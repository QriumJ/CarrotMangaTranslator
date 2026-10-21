import React from "react";
import { useTranslation } from "react-i18next";
import type { EditorSurfaceTone } from "../lib/textRunVisualStyles";
import type { RichTranslationEditorMode } from "./richTranslationEditorTypes";
import type { RichTranslationVisualEditor } from "./useRichTranslationVisualEditor";
import { Textarea } from "./ui/Field";
export type EditorInputProps = {
  codeRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  heightRefCallback: (element: HTMLElement | null) => void;
  mode: RichTranslationEditorMode;
  onChange: (value: string, composing?: boolean) => void;
  onCodeSelect: React.ReactEventHandler<HTMLTextAreaElement>;
  plainText: string;
  /** Field tone that keeps the block's base ink readable while editing. */
  surfaceTone: EditorSurfaceTone;
  value: string;
  visual: RichTranslationVisualEditor;
};
export function RichTranslationEditorInput(
  props: EditorInputProps,
): React.JSX.Element {
  return props.mode === "visual" ? (
    <VisualTranslationInput
      disabled={props.disabled}
      heightRefCallback={props.heightRefCallback}
      plainText={props.plainText}
      surfaceTone={props.surfaceTone}
      visual={props.visual}
    />
  ) : (
    <CodeTranslationInput
      codeRef={props.codeRef}
      disabled={props.disabled}
      heightRefCallback={props.heightRefCallback}
      onChange={props.onChange}
      onSelect={props.onCodeSelect}
      value={props.value}
    />
  );
}

function VisualTranslationInput({
  disabled,
  heightRefCallback,
  plainText,
  surfaceTone,
  visual,
}: Pick<
  EditorInputProps,
  "disabled" | "heightRefCallback" | "plainText" | "surfaceTone" | "visual"
>): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div
      ref={(element) => {
        visual.visualRef.current = element;
        heightRefCallback(element);
      }}
      className="rich-editor-surface"
      data-rich-translated-input=""
      data-surface={surfaceTone}
      contentEditable={!disabled}
      tabIndex={0}
      suppressContentEditableWarning
      role="textbox"
      aria-label={t("editor.translatedText")}
      aria-multiline="true"
      aria-readonly={disabled || undefined}
      data-empty={plainText.length === 0 ? "true" : undefined}
      data-placeholder={t("editor.richText.placeholder", {
        defaultValue: "번역문을 입력하세요",
      })}
      onInput={() => {
        if (!disabled) visual.commitInput();
      }}
      onBeforeInput={(event) => {
        if (disabled) event.preventDefault();
        else visual.onBeforeInput();
      }}
      onCompositionStart={visual.onCompositionStart}
      onCompositionEnd={visual.onCompositionEnd}
      onKeyUp={visual.updateSelection}
      onPointerUp={visual.updateSelection}
      onPaste={(event) => {
        if (disabled) event.preventDefault();
        else visual.onPaste(event);
      }}
    />
  );
}

function CodeTranslationInput({
  codeRef,
  disabled,
  heightRefCallback,
  onChange,
  onSelect,
  value,
}: {
  codeRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  heightRefCallback: (element: HTMLElement | null) => void;
  onChange: (value: string, composing?: boolean) => void;
  onSelect: React.ReactEventHandler<HTMLTextAreaElement>;
  value: string;
}): React.JSX.Element {
  const composing = React.useRef(false);
  const { t } = useTranslation("components");
  return (
    <Textarea
      ref={(element) => {
        codeRef.current = element;
        heightRefCallback(element);
      }}
      className="rich-editor-code"
      data-rich-translated-input=""
      aria-label={t("editor.richText.codeAria", {
        defaultValue: "번역문 서식 코드",
      })}
      value={value}
      readOnly={disabled}
      spellCheck={false}
      onChange={(event) => {
        if (!disabled)
          onChange(
            event.target.value,
            composing.current || (event.nativeEvent as InputEvent).isComposing,
          );
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        if (!disabled) onChange(event.currentTarget.value, false);
      }}
      onSelect={onSelect}
    />
  );
}
