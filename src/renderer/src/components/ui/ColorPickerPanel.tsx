import React from "react";
import { IconColorPicker } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  hexToRgb,
  normalizeHexColor,
  rgbToHex,
  type HsvColor,
  type RgbColor,
} from "../../lib/cssColor";
import { ColorPaletteSwatches } from "./ColorPaletteSwatches";
import { HexColorInput } from "./HexColorInput";
import { IconButton } from "./IconButton";
import { NumberField } from "./NumberField";
import { usePacedColorDraft } from "./usePacedColorDraft";
import styles from "./ColorPicker.module.css";

type EyeDropperConstructor = new () => {
  open: () => Promise<{ sRGBHex: string }>;
};

type ColorPickerPanelProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Leaves the popover, e.g. after a palette swatch was applied. */
  onDone: () => void;
};

const RGB_CHANNELS = ["r", "g", "b"] as const;

export function ColorPickerPanel({
  label,
  value,
  onChange,
  onDone,
}: ColorPickerPanelProps): React.JSX.Element {
  const { t } = useTranslation("components");
  // Everything inside the panel reads the local draft, never the lagging
  // owner value, so dragging stays at pointer speed.
  const draft = usePacedColorDraft(value, onChange);
  const rgb = hexToRgb(draft.hex);

  return (
    <div className={styles.panelBody}>
      <SaturationValueArea hsv={draft.hsv} onChange={draft.setHsv} />
      <HueSlider hsv={draft.hsv} onChange={draft.setHsv} />
      <div className={styles.valueRow}>
        <span
          className={styles.preview}
          style={{ backgroundColor: draft.hex }}
          aria-hidden="true"
        />
        <EyeDropperButton onPick={draft.setHex} />
        <HexColorInput
          className={styles.hexInput}
          ariaLabel={`${label} HEX`}
          value={draft.hex}
          onChange={draft.setHex}
        />
      </div>
      <div className={styles.rgbRow}>
        {RGB_CHANNELS.map((channel) => (
          <label key={channel} className={styles.rgbField}>
            <span className={styles.rgbCaption}>{channel.toUpperCase()}</span>
            <NumberField
              variant="framed"
              ariaLabel={t(`colorPicker.${channel}`)}
              min={0}
              max={255}
              step={1}
              precision={0}
              value={rgb[channel]}
              onValueChange={(next) => {
                const nextRgb: RgbColor = { ...rgb };
                nextRgb[channel] = next;
                draft.setHex(rgbToHex(nextRgb));
              }}
            />
          </label>
        ))}
      </div>
      <div className={styles.paletteSection}>
        <span className={styles.sectionLabel}>{t("colorPicker.palette")}</span>
        <ColorPaletteSwatches
          value={draft.hex}
          onSelect={(swatch) => {
            draft.commitHex(swatch);
            onDone();
          }}
        />
      </div>
    </div>
  );
}

function SaturationValueArea({
  hsv,
  onChange,
}: {
  hsv: HsvColor;
  onChange: (next: HsvColor) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const saturation = Math.round(hsv.s * 100);
  const brightness = Math.round(hsv.v * 100);
  const dragHandlers = useColorDragSurface((x, y) =>
    onChange({ ...hsv, s: x, v: 1 - y }),
  );
  return (
    <div
      {...dragHandlers}
      className={styles.saturationArea}
      style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
      role="slider"
      tabIndex={0}
      aria-label={t("colorPicker.saturationValue")}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={saturation}
      aria-valuetext={t("colorPicker.saturationValueText", {
        saturation,
        brightness,
      })}
      onKeyDown={(event) => {
        const delta = resolveArrowDelta(event, 0.01, 0.1);
        if (!delta) return;
        event.preventDefault();
        onChange({
          ...hsv,
          s: clampUnit(hsv.s + delta.x),
          v: clampUnit(hsv.v + delta.y),
        });
      }}
    >
      <span
        className={styles.saturationThumb}
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

function HueSlider({
  hsv,
  onChange,
}: {
  hsv: HsvColor;
  onChange: (next: HsvColor) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const dragHandlers = useColorDragSurface((x) =>
    onChange({ ...hsv, h: Math.min(359, x * 360) }),
  );
  return (
    <div
      {...dragHandlers}
      className={styles.hueSlider}
      role="slider"
      tabIndex={0}
      aria-label={t("colorPicker.hue")}
      aria-valuemin={0}
      aria-valuemax={359}
      aria-valuenow={Math.round(hsv.h)}
      onKeyDown={(event) => {
        const delta = resolveArrowDelta(event, 1, 10);
        if (!delta) return;
        event.preventDefault();
        const step = delta.x || delta.y;
        onChange({ ...hsv, h: Math.max(0, Math.min(359, hsv.h + step)) });
      }}
    >
      <span
        className={styles.hueThumb}
        style={{ left: `${(hsv.h / 360) * 100}%` }}
        aria-hidden="true"
      />
    </div>
  );
}

function EyeDropperButton({
  onPick,
}: {
  onPick: (hex: string) => void;
}): React.JSX.Element | null {
  const { t } = useTranslation("components");
  const EyeDropper = (window as Window & { EyeDropper?: EyeDropperConstructor })
    .EyeDropper;
  if (!EyeDropper) return null;
  return (
    <IconButton
      size="sm"
      label={t("colorPicker.eyedropper")}
      onClick={() => {
        new EyeDropper()
          .open()
          .then((result) => {
            const hex = normalizeHexColor(result.sRGBHex);
            if (hex) onPick(hex);
          })
          .catch((error: unknown) => {
            // Escape or a click outside the window cancels picking.
            void error;
          });
      }}
    >
      <IconColorPicker size={15} aria-hidden="true" />
    </IconButton>
  );
}

/** Pointer drag over a surface, reported as ratios of its box in [0, 1]. */
function useColorDragSurface(
  onMove: (x: number, y: number) => void,
): Pick<
  React.HTMLAttributes<HTMLDivElement>,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
> {
  const draggingRef = React.useRef(false);
  const report = (event: React.PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    onMove(
      clampUnit((event.clientX - rect.left) / Math.max(1, rect.width)),
      clampUnit((event.clientY - rect.top) / Math.max(1, rect.height)),
    );
  };
  const stop = (): void => {
    draggingRef.current = false;
  };
  return {
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      draggingRef.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch (_error) {
        // error-policy-allow: the pointer may already be released; dragging
        // still works while it stays over the surface.
      }
      event.currentTarget.focus();
      report(event);
    },
    onPointerMove: (event) => {
      if (draggingRef.current) report(event);
    },
    onPointerUp: stop,
    onPointerCancel: stop,
  };
}

function resolveArrowDelta(
  event: React.KeyboardEvent,
  step: number,
  largeStep: number,
): { x: number; y: number } | null {
  const amount = event.shiftKey ? largeStep : step;
  if (event.key === "ArrowRight") return { x: amount, y: 0 };
  if (event.key === "ArrowLeft") return { x: -amount, y: 0 };
  if (event.key === "ArrowUp") return { x: 0, y: amount };
  if (event.key === "ArrowDown") return { x: 0, y: -amount };
  return null;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}
