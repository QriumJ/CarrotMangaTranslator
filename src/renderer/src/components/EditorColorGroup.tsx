import { IconSwitchHorizontal } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import type { TranslationBlock } from "../../../shared/textTypes";
import type { PanelFormatFieldKey } from "../../../shared/panelBridgeTypes";
import { resolveTextBackgroundOpacity } from "../../../shared/textBackground";
import { ColorField } from "./ColorField";
import type { CharacterFormatTarget } from "./editorCharacterFormatTarget";
import { resolveColor } from "./editorPanelUtils";
import { CheckboxField } from "./ui/CheckboxField";
import { EditorNumberField } from "./EditorNumberField";
import { IconButton } from "./ui/IconButton";
import styles from "./EditorColorGroup.module.css";
import typeStyles from "./EditorCharacterFormatSection.module.css";

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

/**
 * The block's full text-area background, independent of letter styles: on/off,
 * fill color and the fill's own opacity. Text and outlines stay opaque.
 */
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
    <BackgroundFillFields
      disabled={disabled}
      enabledLabel={t("format.textBackground.enabled")}
      opacityLabel={t("format.textBackground.opacityLabel")}
      fill={{
        enabled: Boolean(block.textBackgroundEnabled),
        enabledMixed,
        color: resolveColor(block.textBackgroundColor, "#ffffff"),
        colorMixed: mixedFields.has("textBackgroundColor"),
        opacityPercent: Math.round(resolveTextBackgroundOpacity(block) * 100),
        opacityMixed: mixedFields.has("textBackgroundOpacity"),
      }}
      onToggle={(enabled) =>
        onUpdate({
          textBackgroundEnabled: enabledMixed || enabled,
          textBackgroundColor: block.textBackgroundColor ?? "#ffffff",
        })
      }
      onColorChange={(textBackgroundColor) => onUpdate({ textBackgroundColor })}
      onOpacityChange={(percent) =>
        onUpdate({ textBackgroundOpacity: percent / 100 })
      }
    />
  );
}

export type BackgroundFillState = {
  enabled: boolean;
  enabledMixed: boolean;
  color: string;
  colorMixed: boolean;
  opacityPercent: number;
  opacityMixed: boolean;
};

/**
 * A background fill as two equal cells like size and leading: the enable
 * switch titles the color, and the fill's own opacity sits beside it. Both
 * stay in place while off, so turning the fill on never moves the layout.
 */
export function BackgroundFillFields({
  disabled,
  enabledLabel,
  fill,
  opacityLabel,
  onColorChange,
  onOpacityChange,
  onToggle,
}: {
  disabled: boolean;
  enabledLabel: string;
  fill: BackgroundFillState;
  /** Names which fill the percentage fades; the visible title stays short. */
  opacityLabel: string;
  onColorChange: (color: string) => void;
  onOpacityChange: (percent: number) => void;
  onToggle: (enabled: boolean) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const valuesDisabled = disabled || (!fill.enabled && !fill.enabledMixed);
  return (
    <div className={typeStyles.typeGrid}>
      <div className="editor-format-number-cell">
        <CheckboxField
          className={styles.fillTitle}
          inputClassName={styles.fillTitleBox}
          label={enabledLabel}
          checked={fill.enabled}
          indeterminate={fill.enabledMixed}
          disabled={disabled}
          onCheckedChange={onToggle}
        />
        <ColorField
          className="editor-appearance-color"
          label={t("format.textBackground.color")}
          labelHidden
          value={fill.color}
          disabled={valuesDisabled}
          mixed={fill.colorMixed}
          onChange={onColorChange}
        />
      </div>
      <EditorNumberField
        label={t("format.textBackground.opacity")}
        ariaLabel={opacityLabel}
        decreaseLabel={t("format.decreaseValue", { label: opacityLabel })}
        increaseLabel={t("format.increaseValue", { label: opacityLabel })}
        min={0}
        max={100}
        step={1}
        precision={0}
        unit="%"
        value={fill.opacityPercent}
        disabled={valuesDisabled}
        mixed={fill.opacityMixed}
        onChange={onOpacityChange}
      />
    </div>
  );
}
