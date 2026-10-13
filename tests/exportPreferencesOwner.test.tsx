/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import exampleSettings from "../settings.example.json";
import { createTestMangaGatewayStub } from "../src/renderer/src/api/mangaGateway";
import { useSettingsDialog } from "../src/renderer/src/hooks/useSettingsDialog";
import {
  createInitialRasterOptions,
  useExportPreferencePersistence,
} from "../src/renderer/src/components/exportPreferencePersistence";
import {
  DEFAULT_EXPORT_PREFERENCES,
  type ExportPreferences,
} from "../src/shared/exportPreferences";
import type { AppSettings } from "../src/shared/settingsTypes";

const SETTINGS = structuredClone(exampleSettings) as AppSettings;

afterEach(() => {
  cleanup();
  window.mangaApi = createTestMangaGatewayStub();
  vi.clearAllMocks();
});

type Pending = {
  preferences: ExportPreferences;
  resolve: (value: ExportPreferences) => void;
  reject: (error: Error) => void;
};

async function renderOwner(options: { saveSettings?: boolean } = {}) {
  const pending: Pending[] = [];
  const saveExportPreferences = vi.fn(
    (preferences: ExportPreferences) =>
      new Promise<ExportPreferences>((resolve, reject) =>
        pending.push({ preferences, resolve, reject }),
      ),
  );
  let finishSettingsSave: ((value: AppSettings) => void) | undefined;
  window.mangaApi = createTestMangaGatewayStub({
    getSettings: async () => structuredClone(SETTINGS),
    saveExportPreferences,
    ...(options.saveSettings
      ? {
          saveSettings: () =>
            new Promise<AppSettings>((resolve) => {
              finishSettingsSave = resolve;
            }),
        }
      : {}),
  });
  const pushStatus = vi.fn();
  const owner = renderHook(() => useSettingsDialog(pushStatus));
  await waitFor(() => expect(owner.result.current.settings).not.toBeNull());
  return {
    owner,
    pending,
    pushStatus,
    saveExportPreferences,
    finishSettingsSave: (value: AppSettings) => finishSettingsSave?.(value),
  };
}

function prefs(outputFormat: ExportPreferences["outputFormat"]) {
  return { ...DEFAULT_EXPORT_PREFERENCES, outputFormat };
}

function stored(owner: Awaited<ReturnType<typeof renderOwner>>["owner"]) {
  return owner.result.current.settings?.ui?.exportPreferences?.outputFormat;
}

describe("export preference owner", () => {
  it("shows the newest choice at once and sends only the five safe fields", async () => {
    const { owner, saveExportPreferences } = await renderOwner();
    act(() => void owner.result.current.saveExportPreferences(prefs("webp")));

    expect(stored(owner)).toBe("webp");
    expect(saveExportPreferences).toHaveBeenCalledWith(prefs("webp"));
  });

  it.each([
    ["older reply last", [1, 0]],
    ["older reply first", [0, 1]],
  ])("ignores a stale reply (%s)", async (_label, order) => {
    const { owner, pending } = await renderOwner();
    act(() => {
      void owner.result.current.saveExportPreferences(prefs("jpeg"));
      void owner.result.current.saveExportPreferences(prefs("png"));
    });
    for (const index of order) {
      await act(async () =>
        pending[index]?.resolve(pending[index].preferences),
      );
    }
    expect(stored(owner)).toBe("png");
  });

  it("keeps a pending choice when a full settings reply arrives first", async () => {
    const { owner, pending, finishSettingsSave } = await renderOwner({
      saveSettings: true,
    });
    act(() => {
      void owner.result.current.saveSettingsQuietly(structuredClone(SETTINGS));
      void owner.result.current.saveExportPreferences(prefs("webp"));
    });
    await act(async () => finishSettingsSave(structuredClone(SETTINGS)));
    expect(stored(owner)).toBe("webp");

    await act(async () => pending[0]?.resolve(prefs("webp")));
    expect(stored(owner)).toBe("webp");
  });

  it("keeps an acknowledged output choice when an older settings response arrives later", async () => {
    const { owner, pending, finishSettingsSave } = await renderOwner({
      saveSettings: true,
    });
    act(() => {
      void owner.result.current.saveSettingsQuietly(structuredClone(SETTINGS));
      void owner.result.current.saveExportPreferences(prefs("webp"));
    });
    await act(async () => pending[0]?.resolve(prefs("webp")));
    await act(async () => finishSettingsSave(structuredClone(SETTINGS)));
    expect(stored(owner)).toBe("webp");
  });

  it("reports only a failure of the newest choice", async () => {
    const { owner, pending, pushStatus } = await renderOwner();
    let older!: Promise<boolean>;
    let newer!: Promise<boolean>;
    act(() => {
      older = owner.result.current.saveExportPreferences(prefs("jpeg"));
      newer = owner.result.current.saveExportPreferences(prefs("png"));
    });
    await act(async () => pending[0]?.reject(new Error("disk busy")));
    await expect(older).resolves.toBe(false);
    expect(pushStatus).not.toHaveBeenCalled();

    await act(async () => pending[1]?.reject(new Error("disk full")));
    await expect(newer).resolves.toBe(false);
    expect(pushStatus).toHaveBeenCalledOnce();
  });

  it("restores the latest choice in a modal reopened while its save is pending", async () => {
    const { owner, pending } = await renderOwner();
    const mountModal = () =>
      renderHook(
        ({ options }) =>
          useExportPreferencePersistence({
            enabled: true,
            options,
            persist: owner.result.current.saveExportPreferences,
          }),
        {
          initialProps: {
            options: createInitialRasterOptions(
              owner.result.current.settings?.ui?.exportPreferences,
            ),
          },
        },
      );

    const first = mountModal();
    first.rerender({
      options: { ...prefs("jpeg"), collisionPolicy: "cancel" },
    });
    first.unmount();

    const reopened = createInitialRasterOptions(
      owner.result.current.settings?.ui?.exportPreferences,
    );
    expect(reopened.outputFormat).toBe("jpeg");
    expect(reopened.collisionPolicy).toBe("cancel");
    expect(pending).toHaveLength(1);
  });
});
