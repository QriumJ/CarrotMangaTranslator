// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_EXPORT_PREFERENCES } from "../src/shared/exportPreferences";
import {
  useExportPreferencePersistence,
  type PersistExportPreferences,
} from "../src/renderer/src/components/exportPreferencePersistence";
import type { ManualRasterExportOptions } from "../src/renderer/src/hooks/useExportPageImagesAction";

afterEach(cleanup);

it("keeps the latest choice when a modal closes and reopens during a save", async () => {
  let finishFirst!: (saved: boolean) => void;
  const firstSave = new Promise<boolean>((resolve) => {
    finishFirst = resolve;
  });
  const persist = vi.fn<PersistExportPreferences>().mockResolvedValue(true);
  persist.mockImplementationOnce(() => firstSave);
  const options = (
    outputFormat: ManualRasterExportOptions["outputFormat"],
  ): ManualRasterExportOptions => ({
    ...DEFAULT_EXPORT_PREFERENCES,
    outputFormat,
    collisionPolicy: "cancel",
  });
  const first = renderHook(
    ({ format }: { format: ManualRasterExportOptions["outputFormat"] }) =>
      useExportPreferencePersistence({
        enabled: true,
        options: options(format),
        persist,
      }),
    {
      initialProps: {
        format: "source" as ManualRasterExportOptions["outputFormat"],
      },
    },
  );
  first.rerender({ format: "jpeg" });
  first.rerender({ format: "webp" });
  first.unmount();
  const second = renderHook(
    ({ format }: { format: ManualRasterExportOptions["outputFormat"] }) =>
      useExportPreferencePersistence({
        enabled: true,
        options: options(format),
        persist,
      }),
    {
      initialProps: {
        format: "source" as ManualRasterExportOptions["outputFormat"],
      },
    },
  );
  second.rerender({ format: "png" });
  await act(async () => finishFirst(true));
  expect(persist.mock.calls.at(-1)?.[0].outputFormat).toBe("png");
});
