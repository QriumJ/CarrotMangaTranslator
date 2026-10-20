import { buildTranslatedTextImport } from "../../../../shared/gatherTextFile";
import React from "react";
import { useTranslation } from "react-i18next";
import type {
  ChapterSnapshot,
  MangaPage,
} from "../../../../shared/libraryTypes";
import { toast } from "../../lib/toastStore";
import {
  decodeImportedTextContent,
  gatherText,
  type GatherScope,
} from "../../../../shared/gatherText";
import { gatherTextGateway } from "./gatherTextGateway";
import { useMountedRef } from "../../hooks/useMountedRef";
import type { GatherTextModalProps } from "./gatherTextTypes";

type TxtImportOptions = {
  chapter: ChapterSnapshot | null;
  page: MangaPage | null;
  scope: GatherScope;
  readingDirection: "ltr" | "rtl";
  field?: "both" | "translated";
  onApplyTranslatedText?: GatherTextModalProps["onApplyTranslatedText"];
  setReviewWarnings: (warnings: string[]) => void;
};

export function useTxtImportAction({
  chapter,
  page,
  scope,
  readingDirection,
  field = "translated",
  onApplyTranslatedText,
  setReviewWarnings,
}: TxtImportOptions): (file: File) => Promise<void> {
  const { t } = useTranslation("components");
  const { t: tRenderer } = useTranslation("renderer");
  const mounted = useMountedRef();
  return React.useCallback(
    async (file: File) => {
      if (!chapter || !onApplyTranslatedText) {
        return;
      }
      try {
        const content = decodeImportedTextContent(await file.arrayBuffer());
        if (!mounted.current) return;
        const result = buildTranslatedTextImport(
          gatherText({ chapter, page, scope, direction: readingDirection }),
          content,
          tRenderer,
          field,
        );
        setReviewWarnings(result.warnings);
        if (!result.updates.length) {
          toast.info(
            result.matchedPageCount
              ? t("gatherText.importTxt.noChanges")
              : t("gatherText.importTxt.noApplicableText"),
          );
          return;
        }
        if (
          !window.confirm(
            t("gatherText.importTxt.confirm", { count: result.updates.length }),
          )
        ) {
          return;
        }
        onApplyTranslatedText(result.updates, chapter);
        toast.success(
          t("gatherText.importTxt.updated", { count: result.updates.length }),
        );
        if (result.warnings.length) {
          toast.info(
            t("gatherText.importTxt.warnings", {
              count: result.warnings.length,
            }),
          );
        }
      } catch (error) {
        console.error(error);
        if (mounted.current && error instanceof Error)
          setReviewWarnings([error.message]);
        toast.error(t("gatherText.importTxt.failed"));
      }
    },
    [
      chapter,
      mounted,
      onApplyTranslatedText,
      page,
      readingDirection,
      field,
      scope,
      setReviewWarnings,
      t,
      tRenderer,
    ],
  );
}

export function useGatherTextActions(
  text: string,
  defaultName: string,
  fileText = text,
): { handleCopy: () => Promise<void>; handleSave: () => Promise<void> } {
  const { t } = useTranslation("components");
  const handleCopy = React.useCallback(async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("gatherText.copySuccess"));
    } catch (_error) {
      toast.error(t("gatherText.copyFailed"));
    }
  }, [t, text]);

  const handleSave = React.useCallback(async () => {
    if (!text) return;
    try {
      const result = await gatherTextGateway.saveTextFile({
        defaultName,
        content: fileText,
      });
      if (result?.saved) toast.success(t("gatherText.saveSuccess"));
    } catch (_error) {
      toast.error(t("gatherText.saveFailed"));
    }
  }, [defaultName, fileText, t, text]);
  return { handleCopy, handleSave };
}

export function buildDefaultName(
  chapter: ChapterSnapshot | null,
  page: MangaPage | null,
  scope: GatherScope,
): string {
  const base = chapter?.title?.trim() || "manga-text";
  return scope === "page" && page ? `${base} - ${page.name}` : base;
}
