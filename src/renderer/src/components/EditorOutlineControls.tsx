import { useTranslation } from "react-i18next";
import {
  MAX_TEXT_OUTLINE_WIDTH_PX,
  MIN_TEXT_OUTLINE_WIDTH_PX,
  TEXT_OUTLINE_WIDTH_STEP_PX,
} from "../../../shared/textOutline";
import { ColorField } from "./ColorField";
import { CheckboxField } from "./ui/CheckboxField";
import { NumberField } from "./ui/NumberField";

export type OutlineControlModel = {
  enabled: boolean;
  toggle: (checked: boolean) => void;
  updateWidth: (value: number) => void;
  widthPx: number;
};

export function OutlineControl({
  color,
  colorMixed,
  colorLabel,
  control,
  disabled,
  enabledLabel,
  onColorChange,
  widthLabel,
  widthMixed,
}: {
  color: string;
  colorMixed: boolean;
  colorLabel: string;
  control: OutlineControlModel;
  disabled: boolean;
  enabledLabel: string;
  onColorChange: (value: string) => void;
  widthLabel: string;
  widthMixed: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className="editor-appearance-row editor-outline-property-row">
      <CheckboxField
        className="editor-appearance-toggle"
        label={enabledLabel}
        checked={control.enabled}
        indeterminate={widthMixed}
        disabled={disabled}
        onCheckedChange={(checked) =>
          control.toggle(widthMixed ? true : checked)
        }
      />
      {control.enabled || widthMixed ? (
        <>
          <ColorField
            className="editor-appearance-color"
            label={colorLabel}
            labelHidden
            value={color}
            disabled={disabled}
            mixed={colorMixed}
            onChange={onColorChange}
          />
          <div className="editor-format-number-cell editor-appearance-number">
            <span className="visually-hidden">{widthLabel}</span>
            <NumberField
              variant="scrubber"
              ariaLabel={widthLabel}
              decreaseLabel={t("format.decreaseValue", { label: widthLabel })}
              increaseLabel={t("format.increaseValue", { label: widthLabel })}
              max={MAX_TEXT_OUTLINE_WIDTH_PX}
              min={MIN_TEXT_OUTLINE_WIDTH_PX}
              precision={1}
              step={TEXT_OUTLINE_WIDTH_STEP_PX}
              unit="px"
              value={control.widthPx}
              disabled={disabled}
              mixed={widthMixed}
              onValueChange={control.updateWidth}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
