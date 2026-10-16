import React from "react";
import { normalizeHexColor } from "./cssColor";
import {
  COLOR_PALETTE_MAX_SWATCHES,
  readWorkspacePreference,
  writeWorkspacePreference,
} from "./workspacePreferences";

/**
 * One app-wide swatch palette. Every color control reads the same list, so a
 * color saved while retouching is immediately available for text color too.
 */
type Listener = () => void;

const listeners = new Set<Listener>();
let cached: readonly string[] | null = null;

function readPalette(): readonly string[] {
  cached ??= readWorkspacePreference("colorPalette");
  return cached;
}

function writePalette(next: readonly string[]): void {
  writeWorkspacePreference("colorPalette", next);
  cached = readWorkspacePreference("colorPalette");
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canAddPaletteColor(
  palette: readonly string[],
  color: string,
): boolean {
  const normalized = normalizeHexColor(color);
  return (
    normalized !== null &&
    !palette.includes(normalized) &&
    palette.length < COLOR_PALETTE_MAX_SWATCHES
  );
}

/** Appends `color`; saved swatches keep their order and never repeat. */
export function addPaletteColor(color: string): void {
  const palette = readPalette();
  const normalized = normalizeHexColor(color);
  if (!normalized || !canAddPaletteColor(palette, normalized)) return;
  writePalette([...palette, normalized]);
}

export function removePaletteColor(color: string): void {
  const normalized = normalizeHexColor(color);
  writePalette(readPalette().filter((swatch) => swatch !== normalized));
}

export function useColorPalette(): readonly string[] {
  return React.useSyncExternalStore(subscribe, readPalette, readPalette);
}

/** Test seam: drops the in-memory copy so the next read hits storage. */
export function resetColorPaletteCache(): void {
  cached = null;
}
