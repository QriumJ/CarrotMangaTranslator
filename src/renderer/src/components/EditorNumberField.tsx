import { useTranslation } from "react-i18next";
import { NumberField } from "./ui/NumberField";

/** One label-above scrubber cell shared by every numeric format control. */
export function EditorNumberField({
  ariaLabel,
  decreaseLabel,
  disabled,
  increaseLabel,
  label,
  max,
  min,
  mixed,
  onChange,
  onStep,
  precision = 1,
  step,
  unit = "px",
  value,
}: {
  ariaLabel?: string;
  decreaseLabel?: string;
  disabled: boolean;
  increaseLabel?: string;
  label: string;
  max: number;
  min: number;
  mixed: boolean;
  onChange: (value: number) => void;
  onStep?: (direction: -1 | 1) => void;
  precision?: number;
  step: number;
  unit?: string;
  value: number;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className="editor-format-number-cell">
      <span>{label}</span>
      <NumberField
        variant="scrubber"
        ariaLabel={ariaLabel ?? label}
        decreaseLabel={decreaseLabel ?? t("format.decreaseValue", { label })}
        increaseLabel={increaseLabel ?? t("format.increaseValue", { label })}
        disabled={disabled}
        mixed={mixed}
        max={max}
        min={min}
        precision={precision}
        step={step}
        unit={unit}
        value={value}
        onStep={onStep}
        onValueChange={onChange}
      />
    </div>
  );
}
