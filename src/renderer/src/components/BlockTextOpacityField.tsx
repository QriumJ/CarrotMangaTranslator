import { useTranslation } from "react-i18next";
import { EditorNumberField } from "./EditorNumberField";

export function BlockTextOpacityField({
  disabled,
  mixed,
  opacity,
  onChange,
}: {
  disabled: boolean;
  mixed: boolean;
  /** Text opacity ratio, shown as a percentage. */
  opacity: number;
  onChange: (opacity: number) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <EditorNumberField
      label={t("format.textOpacity")}
      min={0}
      max={100}
      step={1}
      precision={0}
      unit="%"
      value={Math.round(opacity * 100)}
      disabled={disabled}
      mixed={mixed}
      onChange={(value) => onChange(value / 100)}
    />
  );
}
