import React from "react";
import { useTranslation } from "react-i18next";
import type { ChapterSnapshot } from "../../../../shared/libraryTypes";
import type { ReviewExportFormat } from "../../../../shared/reviewTypes";
import { decodeImportedTextContent } from "../../../../shared/gatherText";
import { toast } from "../../lib/toastStore";
import { gatherTextGateway } from "./gatherTextGateway";
import type { GatherTextModalProps } from "./gatherTextTypes";
import { useMountedRef } from "../../hooks/useMountedRef";

type ReviewActionOptions = {
  chapter: ChapterSnapshot | null;
  onImportReviewText?: GatherTextModalProps["onImportReviewText"];
  setReviewBusy: (busy: boolean) => void;
  setReviewWarnings: (warnings: string[]) => void;
};

export function useReviewTextActions({
  chapter,
  onImportReviewText,
  setReviewBusy,
  setReviewWarnings,
}: ReviewActionOptions): {
  handleExportReview: (format: ReviewExportFormat) => Promise<void>;
  handleImportReviewFile: (file: File) => Promise<void>;
} {
  const { t } = useTranslation("components");
  const mounted = useMountedRef();
  const handleExportReview = React.useCallback(
    async (format: ReviewExportFormat) => {
      if (!chapter) return;
      try {
        const result = await gatherTextGateway.exportReviewText({
          chapterId: chapter.id,
          format,
          includeBom: true,
        });
        if (result?.saved) {
          toast.success(t("gatherText.review.saveSuccess"));
        }
      } catch (error) {
        console.error(error);
        toast.error(t("gatherText.review.saveFailed"));
      }
    },
    [chapter, t],
  );

  const handleImportReviewFile = React.useCallback(
    async (file: File) => {
      if (
        !chapter ||
        !onImportReviewText ||
        !window.confirm(t("gatherText.review.importConfirm"))
      ) {
        return;
      }
      setReviewBusy(true);
      setReviewWarnings([]);
      try {
        const content = decodeImportedTextContent(await file.arrayBuffer());
        if (!mounted.current) return;
        const result = await onImportReviewText({
          chapterId: chapter.id,
          content,
          format: file.name.toLowerCase().endsWith(".tsv") ? "tsv" : "csv",
          updateSourceText: false,
          requireSourceMatch: false,
        });
        if (!mounted.current) return;
        setReviewWarnings(result.warnings);
        toast.success(
          t("gatherText.review.updated", {
            count: result.updatedBlockCount,
          }),
        );
        if (result.warnings.length) {
          toast.info(
            t("gatherText.review.warnings", {
              count: result.warnings.length,
            }),
          );
        }
      } catch (error) {
        console.error(error);
        if (mounted.current && error instanceof Error)
          setReviewWarnings([error.message]);
        toast.error(t("gatherText.review.importFailed"));
      } finally {
        if (mounted.current) setReviewBusy(false);
      }
    },
    [chapter, mounted, onImportReviewText, setReviewBusy, setReviewWarnings, t],
  );
  return { handleExportReview, handleImportReviewFile };
}
