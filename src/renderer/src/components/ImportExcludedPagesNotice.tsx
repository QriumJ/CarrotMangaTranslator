import React from "react";
import { useTranslation } from "react-i18next";
import type { ImportPreviewResult } from "../../../shared/importTypes";
import { InlineMessage } from "./ui/InlineMessage";

export function ImportExcludedPagesNotice({
  preview,
}: {
  preview: ImportPreviewResult;
}): React.JSX.Element | null {
  const { t } = useTranslation("components");
  const excludedPages = preview.excludedPages ?? [];
  if (excludedPages.length === 0) return null;

  const visible = excludedPages
    .slice(0, 3)
    .map(({ chapterTitle, pageName }) => `${chapterTitle} / ${pageName}`)
    .join(", ");
  const remaining = excludedPages.length - 3;
  return (
    <InlineMessage
      variant="warning"
      title={t("import.excludedImagesTitle", { count: excludedPages.length })}
      detail={t("import.excludedImagesDetail", {
        files: visible,
        more:
          remaining > 0
            ? t("import.excludedImagesMore", { count: remaining })
            : "",
      })}
    />
  );
}
