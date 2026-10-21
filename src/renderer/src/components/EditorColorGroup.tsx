import { IconSwitchHorizontal } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { TranslationBlock } from "../../../shared/textTypes";
import type { PanelFormatFieldKey } from "../../../shared/panelBridgeTypes";
import { ColorField } from "./ColorField";
import type { CharacterFormatTarget } from "./editorCharacterFormatTarget";
import { resolveColor } from "./editorPanelUtils";
import { CheckboxField } from "./ui/CheckboxField";
import { IconButton } from "./ui/IconButton";
import styles from "./EditorColorGroup.module.css";

/** Text color cell of the character grid, with the text/outline color swap. */
export function EditorColorGroup({
  disabled,
  target,
}: {
  disabled: boolean;
  target: CharacterFormatTarget;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const { mixed, values } = target;
  return (
    <div className="editor-format-number-cell">
      <span>{t("format.textColor")}</span>
      <div className={styles.colorControl}>
        <ColorField
          className="editor-appearance-color"
          label={t("format.textColor")}
          labelHidden
          value={values.color}
          disabled={disabled}
          mixed={mixed.has("color")}
          onChange={(color) => target.apply({ color })}
        />
        <IconButton
          size="sm"
          label={t("editor.swapTextOutlineColors")}
          title={t("editor.swapTextOutlineColors")}
          disabled={disabled}
          onClick={() =>
            target.apply({
              color: values.outlineColor,
              outlineColor: values.color,
            })
          }
        >
          <IconSwitchHorizontal size={15} stroke={2.1} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}

/** The block's full text-area background, independent of letter styles. */
export function TextBackgroundField({
  block,
  disabled,
  mixedFields,
  onUpdate,
}: {
  block: TranslationBlock;
  disabled: boolean;
  mixedFields: ReadonlySet<PanelFormatFieldKey>;
  onUpdate: (patch: Partial<TranslationBlock>) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const enabledMixed = mixedFields.has("textBackgroundEnabled");
  return (
    <div className="editor-appearance-row">
      <CheckboxField
        className="editor-appearance-toggle"
        label={t("format.textBackground.enabled")}
        checked={Boolean(block.textBackgroundEnabled)}
        indeterminate={enabledMixed}
        disabled={disabled}
        onCheckedChange={(enabled) =>
          onUpdate({
            textBackgroundEnabled: enabledMixed || enabled,
            textBackgroundColor: block.textBackgroundColor ?? "#ffffff",
          })
        }
      />
      {block.textBackgroundEnabled ? (
        <ColorField
          className="editor-appearance-color"
          label={t("format.textBackground.color")}
          labelHidden
          value={resolveColor(block.textBackgroundColor, "#ffffff")}
          disabled={disabled}
          mixed={mixedFields.has("textBackgroundColor")}
          onChange={(textBackgroundColor) => onUpdate({ textBackgroundColor })}
        />
      ) : null}
    </div>
  );
}
