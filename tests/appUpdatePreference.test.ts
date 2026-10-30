import { expect, it } from "vitest";
import { resolveDefaultAppSettings } from "../src/main/appSettings";
import { normalizeUiSettings } from "../src/main/settings/appSettingsUiNormalize";
import { preserveIndependentUiPreferences } from "../src/main/settings/settingsMutationQueue";

it("defaults startup checking on for new and migrated settings, while preserving explicit opt-out", () => {
  const defaults = resolveDefaultAppSettings({}, null);
  expect(defaults.ui?.checkUpdatesOnStartup).toBe(true);
  expect(normalizeUiSettings({}, defaults).checkUpdatesOnStartup).toBe(true);
  expect(
    normalizeUiSettings({ checkUpdatesOnStartup: false }, defaults)
      .checkUpdatesOnStartup,
  ).toBe(false);
});

it("does not overwrite the independently saved update preference from an older settings form", () => {
  const submitted = resolveDefaultAppSettings({}, null);
  const current = {
    ...submitted,
    ui: { ...submitted.ui, checkUpdatesOnStartup: false },
  };
  expect(
    preserveIndependentUiPreferences(submitted, current).ui
      ?.checkUpdatesOnStartup,
  ).toBe(false);
});
