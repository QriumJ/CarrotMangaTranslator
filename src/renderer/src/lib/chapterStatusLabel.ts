import type { TFunction } from "i18next";

/** The library tree and chapter pickers name chapter progress the same way. */
export function resolveChapterStatusLabel(
  status: string,
  t: TFunction<"components">,
): string {
  switch (status) {
    case "completed":
      return t("status.completed");
    case "running":
      return t("common.inProgress");
    case "failed":
      return t("status.failed");
    case "partial":
      return t("status.partiallyCompleted");
    default:
      return t("status.waiting");
  }
}
