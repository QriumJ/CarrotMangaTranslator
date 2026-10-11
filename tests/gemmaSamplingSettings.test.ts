import { describe, expect, it } from "vitest";
import {
  buildBaseTranslationOptions,
  parseStoredAppSettings,
  resolveDefaultAppSettings,
} from "../src/main/appSettings";
import { AppSettingsSchema } from "../src/shared/ipcSettingsSchemas";
import { DEFAULT_GEMMA_SAMPLING } from "../src/shared/gemmaSamplingSettings";
import { DEFAULT_BLOCK_FORMAT_DEFAULTS } from "../src/shared/blockFormat";
import { buildSettingsFromDraft } from "../src/renderer/src/components/settingsModal/settingsModalBuildSettings";
import { createSettingsFormValues } from "../src/renderer/src/components/settingsModal/settingsModalFormValues";
import { resolveSettingsDraft } from "../src/renderer/src/components/settingsModal/settingsModalFormUtils";

describe("Gemma sampling settings", () => {
  it("uses built-in sampling defaults with legacy default objects and null optional Top K", () => {
    const defaults = resolveDefaultAppSettings({});
    delete defaults.gemma.temperature;
    delete defaults.gemma.topP;
    delete defaults.gemma.topK;
    const restored = parseStoredAppSettings(
      '{"gemma":{"topK":null}}',
      defaults,
    );
    expect(restored.gemma).toMatchObject(DEFAULT_GEMMA_SAMPLING);
    expect(createSettingsFormValues(defaults).gemmaSampling).toEqual(
      DEFAULT_GEMMA_SAMPLING,
    );
  });
  it("restores legacy defaults and round-trips a saved form into runtime options independently of API settings", () => {
    const initialSettings = parseStoredAppSettings(
      "{}",
      resolveDefaultAppSettings({}),
    );
    expect(initialSettings.gemma).toMatchObject(DEFAULT_GEMMA_SAMPLING);
    const values = createSettingsFormValues(initialSettings);
    values.gemmaSampling = { temperature: 0, topP: 0.8, topK: 40 };
    const saved = buildSettingsFromDraft({
      values,
      draft: resolveSettingsDraft(values),
      initialSettings,
      keybindings: {},
      blockFormatDefaults: DEFAULT_BLOCK_FORMAT_DEFAULTS,
    });
    expect(AppSettingsSchema.safeParse(saved).success).toBe(true);
    const restored = parseStoredAppSettings(
      JSON.stringify(saved),
      initialSettings,
    );
    expect(createSettingsFormValues(restored).gemmaSampling).toEqual(
      values.gemmaSampling,
    );
    expect(restored.api).toMatchObject({
      temperature: initialSettings.api.temperature,
      topP: initialSettings.api.topP,
      topK: initialSettings.api.topK,
    });
    const input = {
      jobId: "sampling-test",
      runDir: "C:/runs/sampling-test",
      paths: {
        dataRoot: "C:/app-data",
        toolsDir: "C:/tools",
        llamaServerPath: "C:/tools/llama-server.exe",
      },
      settings: restored,
    };
    expect(buildBaseTranslationOptions({ ...input, env: {} })).toMatchObject(
      values.gemmaSampling,
    );
    expect(
      buildBaseTranslationOptions({
        ...input,
        env: {
          MANGA_TRANSLATOR_TEMPERATURE: "0.3",
          MANGA_TRANSLATOR_TOP_P: "0.7",
          MANGA_TRANSLATOR_TOP_K: "20",
        },
      }),
    ).toMatchObject({ temperature: 0.3, topP: 0.7, topK: 20 });
  });

  it.each([
    ["temperature", -0.1],
    ["temperature", 2.1],
    ["topP", 0],
    ["topP", 1.1],
    ["topK", 0],
    ["topK", 501],
    ["topK", 2.5],
  ])("rejects invalid %s=%s at IPC", (key, value) => {
    const settings = resolveDefaultAppSettings({});
    expect(
      AppSettingsSchema.safeParse({
        ...settings,
        gemma: { ...settings.gemma, [key]: value },
      }).success,
    ).toBe(false);
  });

  it("normalizes out-of-range stored values and replaces invalid numbers", () => {
    const defaults = resolveDefaultAppSettings({});
    expect(
      parseStoredAppSettings(
        JSON.stringify({ gemma: { temperature: -1, topP: 5, topK: 999 } }),
        defaults,
      ).gemma,
    ).toMatchObject({ temperature: 0, topP: 1, topK: 500 });
    expect(
      parseStoredAppSettings(
        JSON.stringify({
          gemma: { temperature: "invalid", topP: "invalid", topK: 2.5 },
        }),
        defaults,
      ).gemma,
    ).toMatchObject(DEFAULT_GEMMA_SAMPLING);
  });
});
