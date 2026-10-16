import React from "react";
import { IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  addPaletteColor,
  canAddPaletteColor,
  removePaletteColor,
  useColorPalette,
} from "../../lib/colorPaletteStore";
import { normalizeHexColor } from "../../lib/cssColor";
import { IconButton } from "./IconButton";
import styles from "./ColorPicker.module.css";

export type ColorPaletteSwatchesProps = {
  className?: string;
  disabled?: boolean;
  /** The color currently applied; it is what the add button saves. */
  value: string;
  onSelect: (value: string) => void;
};

/**
 * The app-wide saved colors. Click applies a swatch, the + button saves the
 * current color, and right-click or Delete removes a swatch.
 */
export function ColorPaletteSwatches({
  className,
  disabled = false,
  value,
  onSelect,
}: ColorPaletteSwatchesProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const palette = useColorPalette();
  const current = normalizeHexColor(value);
  const canAdd = current !== null && canAddPaletteColor(palette, current);

  return (
    <div
      className={[styles.palette, className].filter(Boolean).join(" ")}
      role="group"
      aria-label={t("colorPicker.palette")}
    >
      {palette.map((swatch) => (
        <button
          key={swatch}
          type="button"
          className={styles.paletteSwatch}
          style={{ backgroundColor: swatch }}
          aria-label={swatch.toUpperCase()}
          aria-pressed={swatch === current}
          title={t("colorPicker.swatchHint", { color: swatch.toUpperCase() })}
          disabled={disabled}
          onClick={() => onSelect(swatch)}
          onContextMenu={(event) => {
            event.preventDefault();
            removePaletteColor(swatch);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Delete" && event.key !== "Backspace") return;
            event.preventDefault();
            removePaletteColor(swatch);
          }}
        />
      ))}
      <IconButton
        className={styles.paletteAdd}
        size="sm"
        label={t("colorPicker.addToPalette")}
        disabled={disabled || !canAdd}
        onClick={() => {
          if (current) addPaletteColor(current);
        }}
      >
        <IconPlus size={14} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
