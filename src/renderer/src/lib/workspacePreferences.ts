import { normalizeHexColor } from "./cssColor";
import type { LibrarySort } from "./librarySort";
import type { GatherField } from "../../../shared/gatherText";
import type { WebImportSizeFilter } from "../../../shared/webImportTypes";

/**
 * Workspace layout and tool preferences that survive restarts. Selections,
 * search text, open modals, masks, zoom and per-page view state are session
 * state and must not be added here. Explicit "save as default" settings live
 * in AppSettings, not in this browser-local store.
 */
export const WORKSPACE_PREFERENCES_STORAGE_KEY = "workspace.preferences.v1";

export const RETOUCH_BRUSH_RADIUS_RANGE = { min: 4, max: 90 } as const;
export const MASK_ADJUSTMENT_RADIUS_RANGE = { min: 1, max: 32 } as const;
export const REGION_REVIEW_BRUSH_SIZE_RANGE = { min: 1, max: 400 } as const;
/** Saved swatches shared by every color control in the app. */
export const COLOR_PALETTE_MAX_SWATCHES = 24;
/** Dragged left-rail width in CSS px; `null` keeps the responsive default. */
export const SIDEBAR_WIDTH_RANGE = { min: 240, max: 760 } as const;
/** Library panel's share of the space it splits with the page list. */
const SIDEBAR_LIBRARY_SPLIT_RANGE = { min: 0.05, max: 0.95 } as const;

export type SidebarCollapsedPanel = "library" | "pages" | null;

export type WorkspacePreferences = {
  stampSource: "current" | "original";
  stampAligned: boolean;
  stampOpacity: number;
  cloneHardness: number;
  healHardness: number;
  inpaintingBrushRadius: number;
  inpaintingPaintColor: string;
  colorPalette: readonly string[];
  maskAdjustmentRadius: number;
  editorFloating: boolean;
  stageToolbarHidden: boolean;
  sidebarCollapsedPanel: SidebarCollapsedPanel;
  sidebarWidth: number | null;
  sidebarLibrarySplit: number | null;
  webImportSizeFilter: WebImportSizeFilter;
  /** Opens translation settings after an import; never starts a run itself. */
  openTranslationAfterImport: boolean;
  skipDuplicateChapterTitles: boolean;
  blockLibrarySort: "recent" | "name";
  workPickerSort: "library" | "title" | "recent";
  linkedWorkspaceSort: LibrarySort;
  regionReviewBrushShape: "circle" | "square";
  regionReviewBrushSize: number;
  transformLockRatio: boolean;
  gatherTextField: GatherField;
  gatherTextExcludeHeaders: boolean;
};

export type WorkspacePreferenceKey = keyof WorkspacePreferences;

export const DEFAULT_WORKSPACE_PREFERENCES: Readonly<WorkspacePreferences> = {
  stampSource: "current",
  stampAligned: true,
  stampOpacity: 100,
  cloneHardness: 100,
  healHardness: 50,
  inpaintingBrushRadius: 28,
  inpaintingPaintColor: "#ffffff",
  colorPalette: ["#ffffff", "#000000", "#808080"],
  maskAdjustmentRadius: 4,
  editorFloating: false,
  stageToolbarHidden: false,
  sidebarCollapsedPanel: null,
  sidebarWidth: null,
  sidebarLibrarySplit: null,
  webImportSizeFilter: "large",
  openTranslationAfterImport: true,
  skipDuplicateChapterTitles: false,
  blockLibrarySort: "recent",
  workPickerSort: "library",
  linkedWorkspaceSort: { key: "updated", direction: "desc" },
  regionReviewBrushShape: "circle",
  regionReviewBrushSize: 24,
  transformLockRatio: true,
  gatherTextField: "both",
  gatherTextExcludeHeaders: false,
};

type PreferenceNormalizers = {
  [Key in WorkspacePreferenceKey]: (
    value: unknown,
  ) => WorkspacePreferences[Key] | undefined;
};

const NORMALIZERS: PreferenceNormalizers = {
  stampSource: (value) => normalizeChoice(value, ["current", "original"]),
  stampAligned: normalizeBoolean,
  stampOpacity: (value) => normalizeInteger(value, { min: 1, max: 100 }),
  cloneHardness: (value) => normalizeInteger(value, { min: 0, max: 100 }),
  healHardness: (value) => normalizeInteger(value, { min: 0, max: 100 }),
  inpaintingBrushRadius: (value) =>
    normalizeInteger(value, RETOUCH_BRUSH_RADIUS_RANGE),
  inpaintingPaintColor: (value) =>
    typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
      ? value.toLowerCase()
      : undefined,
  colorPalette: normalizeColorPalette,
  maskAdjustmentRadius: (value) =>
    normalizeInteger(value, MASK_ADJUSTMENT_RADIUS_RANGE),
  editorFloating: normalizeBoolean,
  stageToolbarHidden: normalizeBoolean,
  sidebarCollapsedPanel: (value) =>
    value === "library" || value === "pages" || value === null
      ? value
      : undefined,
  sidebarWidth: (value) =>
    value === null ? null : normalizeInteger(value, SIDEBAR_WIDTH_RANGE),
  sidebarLibrarySplit: (value) =>
    value === null
      ? null
      : normalizeFraction(value, SIDEBAR_LIBRARY_SPLIT_RANGE),
  webImportSizeFilter: (value) =>
    value === "all" || value === "medium-or-larger" || value === "large"
      ? value
      : undefined,
  openTranslationAfterImport: normalizeBoolean,
  skipDuplicateChapterTitles: normalizeBoolean,
  blockLibrarySort: (value) => normalizeChoice(value, ["recent", "name"]),
  workPickerSort: (value) =>
    normalizeChoice(value, ["library", "title", "recent"]),
  linkedWorkspaceSort: normalizeLinkedWorkspaceSort,
  regionReviewBrushShape: (value) =>
    normalizeChoice(value, ["circle", "square"]),
  regionReviewBrushSize: (value) =>
    normalizeInteger(value, REGION_REVIEW_BRUSH_SIZE_RANGE),
  transformLockRatio: normalizeBoolean,
  gatherTextField: (value) =>
    normalizeChoice(value, ["both", "translated", "source"]),
  gatherTextExcludeHeaders: normalizeBoolean,
};

const PREFERENCE_KEYS = Object.keys(
  DEFAULT_WORKSPACE_PREFERENCES,
) as WorkspacePreferenceKey[];

export function normalizeWorkspacePreferences(
  value: unknown,
): WorkspacePreferences {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const result: WorkspacePreferences = { ...DEFAULT_WORKSPACE_PREFERENCES };
  for (const key of PREFERENCE_KEYS) {
    assignNormalized(result, key, source[key]);
  }
  return result;
}

function normalizeWorkspacePreference<Key extends WorkspacePreferenceKey>(
  key: Key,
  value: unknown,
): WorkspacePreferences[Key] {
  return NORMALIZERS[key](value) ?? DEFAULT_WORKSPACE_PREFERENCES[key];
}

export function readWorkspacePreferences(): WorkspacePreferences {
  try {
    const stored = window.localStorage.getItem(
      WORKSPACE_PREFERENCES_STORAGE_KEY,
    );
    return normalizeWorkspacePreferences(
      stored === null ? null : JSON.parse(stored),
    );
  } catch (_error) {
    // Unavailable storage or a corrupt entry falls back to the defaults.
    return { ...DEFAULT_WORKSPACE_PREFERENCES };
  }
}

export function readWorkspacePreference<Key extends WorkspacePreferenceKey>(
  key: Key,
): WorkspacePreferences[Key] {
  return readWorkspacePreferences()[key];
}

/** Merges one normalized field into the stored record. */
export function writeWorkspacePreference<Key extends WorkspacePreferenceKey>(
  key: Key,
  value: WorkspacePreferences[Key],
): void {
  const next = {
    ...readWorkspacePreferences(),
    [key]: normalizeWorkspacePreference(key, value),
  };
  try {
    window.localStorage.setItem(
      WORKSPACE_PREFERENCES_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch (error) {
    void error; // The live UI state keeps the choice when storage is blocked.
  }
}

function assignNormalized<Key extends WorkspacePreferenceKey>(
  target: WorkspacePreferences,
  key: Key,
  value: unknown,
): void {
  target[key] = normalizeWorkspacePreference(key, value);
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeChoice<const T extends string>(
  value: unknown,
  choices: readonly T[],
): T | undefined {
  return choices.find((choice) => choice === value);
}

function normalizeInteger(
  value: unknown,
  range: { min: number; max: number },
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(range.min, Math.min(range.max, Math.round(value)));
}

function normalizeFraction(
  value: unknown,
  range: { min: number; max: number },
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const clamped = Math.max(range.min, Math.min(range.max, value));
  return Math.round(clamped * 1000) / 1000;
}

/** Keeps valid, distinct `#rrggbb` swatches in saved order. */
export function normalizeColorPalette(
  value: unknown,
): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const swatches: string[] = [];
  for (const entry of value) {
    const color = typeof entry === "string" ? normalizeHexColor(entry) : null;
    if (color && !swatches.includes(color)) swatches.push(color);
    if (swatches.length >= COLOR_PALETTE_MAX_SWATCHES) break;
  }
  return swatches;
}

function normalizeLinkedWorkspaceSort(value: unknown): LibrarySort | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const input = value as Record<string, unknown>;
  const key = normalizeChoice(input.key, [
    "updated",
    "title",
    "created",
    "chapters",
  ]);
  const direction = normalizeChoice(input.direction, ["asc", "desc"]);
  return key && direction ? { key, direction } : undefined;
}
