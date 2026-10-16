import type { InpaintingMaskStroke } from "../../shared/inpaintingTypes";
import {
  buildRetouchCoverage,
  visitRetouchCoverage,
  type SampledRetouchSettings,
} from "../../shared/sampledRetouch";
import { createPoissonDomain, solvePoissonChannel } from "./retouchPoisson";

export type RetouchPatch = {
  positions: Int32Array;
  pixels: Uint8Array;
  scratchBytes: number;
};

/** Inputs are immutable until the complete patch has been calculated successfully. RGBA, straight alpha. */
export function rasterSampledRetouch(
  destination: Uint8Array,
  source: Uint8Array,
  width: number,
  height: number,
  stroke: InpaintingMaskStroke,
  settings: SampledRetouchSettings,
  mode: "clone" | "heal",
  check: () => void = () => {},
): RetouchPatch {
  if (
    destination.length !== width * height * 4 ||
    source.length !== destination.length
  )
    throw new Error("복사 원본과 페이지 크기가 일치하지 않습니다.");
  const { offset, opacity, hardness } = settings;
  const coverage = buildRetouchCoverage(
    width,
    height,
    stroke.points,
    stroke.radiusPx,
    hardness,
    check,
  );
  const positions = new Int32Array(coverage.pixels);
  const amounts = new Float32Array(coverage.pixels);
  let count = 0;
  visitRetouchCoverage(coverage, width, (p, amount, x, y) => {
    const sx = x + offset.x,
      sy = y + offset.y;
    const border = mode === "heal" ? 1 : 0;
    if (
      !inside(sx, sy, width, height, border) ||
      !inside(x, y, width, height, border)
    )
      return;
    if (source[(sy * width + sx) * 4 + 3] === 0) return;
    if (mode === "heal" && destination[p * 4 + 3] === 0) return;
    positions[count] = p;
    amounts[count++] = amount * opacity;
  });
  const active = positions.subarray(0, count);
  const pixels = new Uint8Array(count * 4);
  const displacement = offset.y * width + offset.x;
  const domain = mode === "heal" ? createPoissonDomain(active, width) : null;
  for (let channel = 0; channel < 3; channel++) {
    check();
    const correction = domain
      ? solvePoissonChannel(
          domain,
          (p) =>
            !destination[p * 4 + 3] || !source[(p + displacement) * 4 + 3]
              ? 0
              : (destination[p * 4 + channel] -
                  source[(p + displacement) * 4 + channel]) /
                255,
          check,
        )
      : null;
    blendChannel(
      destination,
      source,
      active,
      amounts,
      pixels,
      displacement,
      channel,
      correction,
    );
  }
  check();
  return {
    positions: active,
    pixels,
    scratchBytes: coverage.tiles.length * 256 ** 2 * 4 + coverage.pixels * 256,
  };
}

export function applyRetouchPatch(
  image: Uint8Array,
  patch: RetouchPatch,
): void {
  for (let i = 0; i < patch.positions.length; i++)
    image.set(patch.pixels.subarray(i * 4, i * 4 + 4), patch.positions[i] * 4);
}

/** Same threshold as persistRetouchDifferenceMask; alpha and all RGB channels count. */
export function updateRetouchDifferenceMask(
  original: Uint8Array,
  image: Uint8Array,
  mask: Uint8Array,
  positions?: Int32Array,
): void {
  const count = positions?.length ?? mask.length;
  for (let i = 0; i < count; i++) {
    const p = positions ? positions[i] : i;
    const o = p * 4;
    const a = original[o + 3],
      b = image[o + 3];
    // Match nativeImage.toBitmap's premultiplied channels, including transparent PNGs.
    mask[p] =
      Math.abs(
        Math.round((original[o] * a) / 255) - Math.round((image[o] * b) / 255),
      ) > 2 ||
      Math.abs(
        Math.round((original[o + 1] * a) / 255) -
          Math.round((image[o + 1] * b) / 255),
      ) > 2 ||
      Math.abs(
        Math.round((original[o + 2] * a) / 255) -
          Math.round((image[o + 2] * b) / 255),
      ) > 2 ||
      Math.abs(original[o + 3] - image[o + 3]) > 2
        ? 1
        : 0;
  }
}

function blendChannel(
  destination: Uint8Array,
  source: Uint8Array,
  active: Int32Array,
  amounts: Float32Array,
  pixels: Uint8Array,
  displacement: number,
  channel: number,
  correction: Float32Array | null,
): void {
  const count = active.length;
  for (let i = 0; i < count; i++) {
    const p = active[i] * 4;
    const s = p + displacement * 4;
    const a = (source[s + 3] / 255) * amounts[i];
    const da = destination[p + 3] / 255;
    const outAlpha = a + da * (1 - a);
    const color = Math.max(
      0,
      Math.min(255, source[s + channel] + (correction?.[i] ?? 0) * 255),
    );
    pixels[i * 4 + channel] = outAlpha
      ? Math.round(
          (color * a + destination[p + channel] * da * (1 - a)) / outAlpha,
        )
      : 0;
    if (channel === 0) pixels[i * 4 + 3] = Math.round(outAlpha * 255);
  }
}

function inside(
  x: number,
  y: number,
  width: number,
  height: number,
  border: number,
): boolean {
  return (
    x >= border && y >= border && x < width - border && y < height - border
  );
}
