import { clamp } from "../../../shared/geometry";

export type RgbColor = { r: number; g: number; b: number };
/** Hue in degrees [0, 360), saturation and value in [0, 1]. */
export type HsvColor = { h: number; s: number; v: number };

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

/** Canonical lower-case `#rrggbb`, or null for anything else. */
export function normalizeHexColor(value: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  return match?.[1] ? `#${match[1].toLowerCase()}` : null;
}

export function hexToRgb(hex: string): RgbColor {
  const value = hex.replace("#", "");
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(clamp(channel, 0, 255))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  let h = 0;
  if (delta > 0) {
    if (max === red) h = ((green - blue) / delta) % 6;
    else if (max === green) h = (blue - red) / delta + 2;
    else h = (red - green) / delta + 4;
  }
  return {
    h: (h * 60 + 360) % 360,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

export function hsvToRgb({ h, s, v }: HsvColor): RgbColor {
  const hue = (((h % 360) + 360) % 360) / 60;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs((hue % 2) - 1));
  const [red, green, blue] =
    hue < 1
      ? [chroma, x, 0]
      : hue < 2
        ? [x, chroma, 0]
        : hue < 3
          ? [0, chroma, x]
          : hue < 4
            ? [0, x, chroma]
            : hue < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const m = v - chroma;
  return {
    r: Math.round((red + m) * 255),
    g: Math.round((green + m) * 255),
    b: Math.round((blue + m) * 255),
  };
}
