import { EditorDisclosure } from "./EditorDisclosure";
import React from "react";
import { useTranslation } from "react-i18next";
import type { EditorSurfaceTone } from "../lib/textRunVisualStyles";
import type { RichTranslationEditorMode } from "./richTranslationEditorTypes";
import type { RichTranslationVisualEditor } from "./useRichTranslationVisualEditor";
import { Button } from "./ui/Button";
import { SegmentedControl } from "./ui/SegmentedControl";
import { RichTranslationEditorInput } from "./RichTranslationEditorInput";
import { IconButton } from "./ui/IconButton";
import { RestoreIcon } from "./ui/icons";

const SPECIAL_CHARACTERS = [
  "…",
  "—",
  "〜",
  "!!",
  "!?",
  "?!",
  "??",
  "♡",
  "♥",
  "♪",
  "♬",
] as const;

type RichTranslationEditorViewProps = {
  beginEditing?: () => void;
  endEditing?: () => void;
  revealToken?: number;
  /** Translation-bound notices shown under the input, inside its section. */
  afterInput?: React.ReactNode;
  afterEditor?: React.ReactNode;
  /** Rendered inside the editor root so control clicks keep the selection. */
  characterFormat?: React.ReactNode;
  clearAllFormatting: () => void;
  codeRef: React.RefObject<HTMLTextAreaElement | null>;
  disabled: boolean;
  editorRootRef: React.RefObject<HTMLDivElement | null>;
  heightRefCallback: (element: HTMLElement | null) => void;
  insertSpecialCharacter: (character: string) => void;
  mode: RichTranslationEditorMode;
  onChange: (value: string, composing?: boolean) => void;
  onCodeSelect: React.ReactEventHandler<HTMLTextAreaElement>;
  plainText: string;
  surfaceTone: EditorSurfaceTone;
  setMode: (mode: RichTranslationEditorMode) => void;
  specialCharactersId: string;
  specialCharactersOpen: boolean;
  toggleSpecialCharacters: () => void;
  value: string;
  visual: RichTranslationVisualEditor;
};

export function RichTranslationEditorView({
  afterEditor,
  afterInput,
  beginEditing,
  characterFormat,
  editorRootRef,
  endEditing,
  revealToken,
  ...props
}: RichTranslationEditorViewProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const header = <RichTranslationEditorHeader {...props} />;
  const body = <RichTranslationEditorBody {...props} afterInput={afterInput} />;
  return (
    <div
      className="rich-translation-editor"
      ref={editorRootRef}
      onPointerDownCapture={props.visual.captureSelectionBeforeControlFocus}
      onFocusCapture={(event) => {
        if (
          (event.target as HTMLElement).closest("[data-rich-translated-input]")
        )
          beginEditing?.();
      }}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          (event.target as HTMLElement).closest("[data-rich-translated-input]")
        ) {
          event.stopPropagation();
          endEditing?.();
          (event.target as HTMLElement).blur();
        }
      }}
    >
      <EditorDisclosure
        id="translation"
        label={t("editor.translatedText")}
        actions={header}
        revealToken={revealToken}
      >
        {body}
      </EditorDisclosure>
      {afterEditor}
      {characterFormat}
    </div>
  );
}

function RichTranslationEditorBody(
  props: Omit<
    RichTranslationEditorViewProps,
    | "afterEditor"
    | "beginEditing"
    | "characterFormat"
    | "editorRootRef"
    | "endEditing"
    | "revealToken"
  >,
): React.JSX.Element {
  return (
    <div className="rich-translation-body">
      <SpecialCharacterPalette
        disabled={props.disabled}
        id={props.specialCharactersId}
        open={props.specialCharactersOpen}
        onInsert={props.insertSpecialCharacter}
      />
      <RichTranslationEditorInput {...props} />
      {props.afterInput}
    </div>
  );
}

type EditorHeaderProps = Pick<
  RichTranslationEditorViewProps,
  | "clearAllFormatting"
  | "disabled"
  | "mode"
  | "plainText"
  | "setMode"
  | "specialCharactersId"
  | "specialCharactersOpen"
  | "toggleSpecialCharacters"
  | "value"
>;

function RichTranslationEditorHeader(
  props: EditorHeaderProps,
): React.JSX.Element {
  return (
    <div className="rich-editor-header">
      <RichTranslationModePicker mode={props.mode} setMode={props.setMode} />
      <RichTranslationEditorToolbar {...props} />
    </div>
  );
}

function RichTranslationModePicker({
  mode,
  setMode,
}: Pick<EditorHeaderProps, "mode" | "setMode">): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className="rich-editor-heading">
      <SegmentedControl
        ariaLabel={t("editor.richText.modeLabel", {
          defaultValue: "번역문 보기 방식",
        })}
        singleRow
        value={mode}
        onChange={setMode}
        options={[
          {
            id: "visual",
            label: t("editor.richText.visualMode", { defaultValue: "편집" }),
          },
          {
            id: "code",
            label: t("editor.richText.codeMode", { defaultValue: "코드" }),
          },
        ]}
      />
    </div>
  );
}

function RichTranslationEditorToolbar({
  clearAllFormatting,
  disabled,
  plainText,
  specialCharactersId,
  specialCharactersOpen,
  toggleSpecialCharacters,
  value,
}: EditorHeaderProps): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className="rich-editor-toolbar">
      <IconButton
        size="sm"
        className="rich-special-character-trigger"
        label={t("editor.richText.specialCharacters", { defaultValue: "기호" })}
        title={t("editor.richText.specialCharacters", { defaultValue: "기호" })}
        aria-controls={specialCharactersId}
        aria-expanded={specialCharactersOpen}
        disabled={disabled}
        onClick={toggleSpecialCharacters}
      >
        <span aria-hidden="true">Ω</span>
      </IconButton>
      <IconButton
        size="sm"
        label={t("editor.richText.resetAll", {
          defaultValue: "번역문 서식 전체 초기화",
        })}
        title={t("editor.richText.resetAllTitle", {
          defaultValue: "번역문 안의 모든 강조와 글자별 서식 제거",
        })}
        disabled={disabled || plainText === value}
        onClick={clearAllFormatting}
      >
        <RestoreIcon size={14} />
      </IconButton>
    </div>
  );
}

function SpecialCharacterPalette({
  disabled,
  id,
  onInsert,
  open,
}: {
  disabled: boolean;
  id: string;
  onInsert: (character: string) => void;
  open: boolean;
}): React.JSX.Element | null {
  const { t } = useTranslation("components");
  if (!open) return null;
  return (
    <div
      id={id}
      className="rich-special-character-panel"
      role="group"
      aria-label={t("editor.richText.specialCharacters", {
        defaultValue: "특수문자",
      })}
    >
      {SPECIAL_CHARACTERS.map((character) => (
        <Button
          key={character}
          size="sm"
          variant="ghost"
          title={t("editor.richText.insertSpecialCharacter", {
            character,
            defaultValue: "{{character}} 입력",
          })}
          disabled={disabled}
          onClick={() => onInsert(character)}
        >
          {character}
        </Button>
      ))}
    </div>
  );
}
