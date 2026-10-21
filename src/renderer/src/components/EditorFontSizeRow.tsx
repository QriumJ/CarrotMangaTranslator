import { useTranslation } from "react-i18next";
import {
  FONT_SIZE_STEP_PX,
  MAX_FONT_SIZE_PX,
  MIN_FONT_SIZE_PX,
} from "../../../shared/blockFormatValues";
import { EditorNumberField } from "./EditorNumberField";
import { clampFontSize } from "./editorPanelUtils";

/** The text size cell; automatic sizing lives with the block-wide settings. */
export function EditorFontSizeRow({
  disabled,
  fontSizeMixed,
  fontSizePx,
  onAdjust,
  onChange,
}: {
  disabled: boolean;
  fontSizeMixed: boolean;
  fontSizePx: number;
  /** Block-wide steps resolve the visible auto-fit size before stepping. */
  onAdjust?: (adjustment: -1 | 1) => void;
  onChange: (fontSizePx: number) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <EditorNumberField
      label={t("format.size")}
      ariaLabel={t("format.fontSizeValue")}
      decreaseLabel={t("format.fontSizeDecrease")}
      increaseLabel={t("format.fontSizeIncrease")}
      min={MIN_FONT_SIZE_PX}
      max={MAX_FONT_SIZE_PX}
      step={FONT_SIZE_STEP_PX}
      value={fontSizePx}
      mixed={fontSizeMixed}
      disabled={disabled}
      onStep={onAdjust}
      onChange={(value) => onChange(clampFontSize(value))}
    />
  );
}
