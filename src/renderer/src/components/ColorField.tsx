import React from "react";
import { useTranslation } from "react-i18next";
import { normalizeHexColor } from "../lib/cssColor";
import { ColorPickerTrigger } from "./ui/ColorPicker";
import { HexColorInput } from "./ui/HexColorInput";

type ColorFieldProps = {
  className?: string;
  label: string;
  labelHidden?: boolean;
  value: string;
  disabled: boolean;
  mixed?: boolean;
  onChange: (value: string) => void;
};

export function ColorField({
  className,
  label,
  labelHidden = false,
  value,
  disabled,
  mixed = false,
  onChange,
}: ColorFieldProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const normalizedValue = normalizeHexColor(value) ?? "#000000";
  // A mixed selection adopts any picked color, even one equal to the first.
  const publish = (next: string): void => {
    if (mixed || next !== normalizedValue) onChange(next);
  };

  return (
    <div
      className={["color-field", className].filter(Boolean).join(" ")}
      data-mixed={mixed ? "" : undefined}
    >
      <span className={labelHidden ? "visually-hidden" : "color-field-label"}>
        {label}
      </span>
      <span
        className="color-picker-button"
        data-disabled={disabled || undefined}
      >
        <ColorPickerTrigger
          className="color-swatch-trigger"
          label={label}
          value={normalizedValue}
          disabled={disabled}
          mixed={mixed}
          onChange={publish}
        />
        <HexColorInput
          className="color-hex-input"
          framed
          ariaLabel={`${label} HEX`}
          value={normalizedValue}
          mixed={mixed}
          placeholder={mixed ? t("gatherText.mixedValue") : undefined}
          disabled={disabled}
          onChange={publish}
        />
      </span>
    </div>
  );
}
