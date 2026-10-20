import type { TFunction } from "i18next";
import type { AppCommand } from "./appCommandTypes";

/** Bound work context command shared by work menus, the quick rail and palette. */
export function buildWorkContextCommand(
  workId: string | null,
  open: ((workId: string) => void) | undefined,
  t: TFunction<"components">,
): AppCommand<"open-work-context"> {
  return {
    id: "open-work-context",
    label: t("styleGuide.title"),
    paletteVisible: Boolean(workId && open),
    run: () => {
      if (workId) open?.(workId);
    },
  };
}
