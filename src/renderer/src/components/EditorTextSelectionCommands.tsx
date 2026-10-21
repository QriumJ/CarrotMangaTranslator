import { useTranslation } from "react-i18next";
import type { CharacterFormatCommands } from "./editorCharacterFormatTarget";
import { Button } from "./ui/Button";
import styles from "./EditorTextSelectionCommands.module.css";

/**
 * Selection shortcuts that sit under the translation they select. Output-line
 * and finish only appear once letters are being edited.
 */
export function EditorTextSelectionCommands({
  commands,
  disabled,
}: {
  commands: CharacterFormatCommands;
  disabled: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className={styles.commands}>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        title={t("format.characterFormat.selectAllTitle")}
        onClick={commands.selectAll}
      >
        {t("format.characterFormat.selectAll")}
      </Button>
      {commands.editing && commands.selectOutputLine ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          title={t("format.characterFormat.selectOutputLineTitle")}
          onClick={commands.selectOutputLine}
        >
          {t("format.characterFormat.selectOutputLine")}
        </Button>
      ) : null}
      {commands.editing ? (
        <Button
          size="sm"
          variant="ghost"
          className={styles.finish}
          disabled={disabled}
          title={t("format.characterFormat.finishEditingTitle")}
          onClick={commands.finishEditing}
        >
          {t("format.characterFormat.finishEditing")}
        </Button>
      ) : null}
    </div>
  );
}
