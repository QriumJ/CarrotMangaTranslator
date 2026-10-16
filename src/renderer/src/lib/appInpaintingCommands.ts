import type { TFunction } from "i18next";
import type { ChapterSnapshot } from "../../../shared/libraryTypes";
import type { AppCommandMap } from "./appCommandTypes";
export function buildInpaintingCommands({
  currentChapter,
  selectSampledTool,
  componentText,
  runCurrentPageInpainting,
  t,
}: {
  currentChapter: ChapterSnapshot | null;
  selectSampledTool?: (tool: "clone" | "heal") => void;
  runCurrentPageInpainting: () => void;
  t: TFunction<"renderer">;
  componentText: TFunction<"components">;
}): Pick<
  AppCommandMap,
  "run-current-page-inpainting" | "retouch-tool-clone" | "retouch-tool-heal"
> {
  return {
    "retouch-tool-clone": {
      id: "retouch-tool-clone",
      label: componentText("stageToolbar.tools.clone.label"),
      paletteVisible: Boolean(currentChapter),
      run: () => selectSampledTool?.("clone"),
    },
    "retouch-tool-heal": {
      id: "retouch-tool-heal",
      label: componentText("stageToolbar.tools.heal.label"),
      paletteVisible: Boolean(currentChapter),
      run: () => selectSampledTool?.("heal"),
    },
    "run-current-page-inpainting": {
      id: "run-current-page-inpainting",
      label: t("commands.autoInpainting.label"),
      keywords: t("commands.autoInpainting.keywords"),
      paletteVisible: Boolean(currentChapter),
      run: runCurrentPageInpainting,
    },
  };
}
