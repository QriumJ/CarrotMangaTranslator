import { useTranslation } from "react-i18next";
import {
  FONT_WIDTH_SCALE_STEP,
  LETTER_SPACING_STEP_EM,
  LINE_HEIGHT_STEP,
  MAX_FONT_WIDTH_SCALE,
  MAX_LETTER_SPACING_EM,
  MAX_LINE_HEIGHT,
  MIN_FONT_WIDTH_SCALE,
  MIN_LETTER_SPACING_EM,
  MIN_LINE_HEIGHT,
  clampFontWidthScale,
  clampLetterSpacingEm,
  clampLineHeight,
} from "../../../shared/blockFormatValues";
import { EditorNumberField } from "./EditorNumberField";

export type BlockSpacingValues = {
  /** Leading ratio, shown as a percentage (1.18 → 118%). */
  lineHeight: number;
  letterSpacingEm: number;
  /** Horizontal glyph scale ratio, shown as a percentage. */
  fontWidthScale: number;
};

/** Leading, tracking and glyph width cells of the format number grid. */
export function BlockSpacingFields({
  disabled,
  mixed,
  values,
  onChange,
}: {
  disabled: boolean;
  mixed: Readonly<Record<keyof BlockSpacingValues, boolean>>;
  values: BlockSpacingValues;
  onChange: (patch: Partial<BlockSpacingValues>) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <>
      <EditorNumberField
        label={t("format.lineHeight")}
        min={MIN_LINE_HEIGHT * 100}
        max={MAX_LINE_HEIGHT * 100}
        step={LINE_HEIGHT_STEP * 100}
        precision={0}
        unit="%"
        value={Math.round(clampLineHeight(values.lineHeight) * 100)}
        disabled={disabled}
        mixed={mixed.lineHeight}
        onChange={(value) =>
          onChange({ lineHeight: clampLineHeight(value / 100) })
        }
      />
      <EditorNumberField
        label={t("format.letterSpacing")}
        min={MIN_LETTER_SPACING_EM}
        max={MAX_LETTER_SPACING_EM}
        step={LETTER_SPACING_STEP_EM}
        precision={2}
        unit="em"
        value={clampLetterSpacingEm(values.letterSpacingEm)}
        disabled={disabled}
        mixed={mixed.letterSpacingEm}
        onChange={(value) =>
          onChange({ letterSpacingEm: clampLetterSpacingEm(value) })
        }
      />
      <EditorNumberField
        label={t("format.fontWidth")}
        min={MIN_FONT_WIDTH_SCALE * 100}
        max={MAX_FONT_WIDTH_SCALE * 100}
        step={FONT_WIDTH_SCALE_STEP * 100}
        precision={0}
        unit="%"
        value={Math.round(clampFontWidthScale(values.fontWidthScale) * 100)}
        disabled={disabled}
        mixed={mixed.fontWidthScale}
        onChange={(value) =>
          onChange({ fontWidthScale: clampFontWidthScale(value / 100) })
        }
      />
    </>
  );
}
