import type { AppPaths } from "../appPaths";
import { updateAppSettings, type GpuInfoProvider } from "../settingsStore";
import {
  ExportPreferencesSchema,
  type ExportPreferences,
} from "../../shared/exportPreferences";

/** Merge inside the shared settings write queue, never from a renderer snapshot. */
export async function saveExportPreferences(
  value: ExportPreferences,
  paths?: AppPaths,
  env?: NodeJS.ProcessEnv,
  detectGpu?: GpuInfoProvider,
): Promise<ExportPreferences> {
  const preferences = ExportPreferencesSchema.parse(value);
  await updateAppSettings(
    (current) => ({
      ...current,
      ui: { ...current.ui, exportPreferences: preferences },
    }),
    paths,
    env,
    detectGpu,
  );
  return preferences;
}
