import type { TFunction } from "i18next";
import type { AppCommandMap } from "./appCommandTypes";
type OutputCommandId = "open-export-options" | "open-psd-export-options";

export function buildOutputCommands({
  currentChapter,
  componentText,
  openExportOptions,
  t,
}: {
  currentChapter: { pages: readonly unknown[] } | null;
  componentText: TFunction<"components">;
  openExportOptions?: (kind: "raster" | "psd") => void;
  t: TFunction<"renderer">;
}): Pick<AppCommandMap, OutputCommandId> {
  // Export covers the whole chapter, so it needs pages but no selected page,
  // and like the completion-card entry it stays open beside running jobs.
  const available = Boolean(currentChapter?.pages.length && openExportOptions);
  const open = (kind: "raster" | "psd") => () => {
    if (available) openExportOptions?.(kind);
  };
  return {
    "open-export-options": {
      id: "open-export-options",
      label: componentText("inpainting.export.resultAction"),
      keywords: t("commands.exportResults.keywords"),
      paletteVisible: available,
      run: open("raster"),
    },
    "open-psd-export-options": {
      id: "open-psd-export-options",
      label: componentText("inpainting.export.psdAction"),
      keywords: t("commands.exportPsd.keywords"),
      paletteVisible: available,
      run: open("psd"),
    },
  };
}
