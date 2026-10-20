import React from "react";
import type { TFunction } from "i18next";
import type { WorkStyleGuide } from "../../../../shared/workContextTypes";
import {
  buildWorkGlossaryFile,
  parseWorkGlossaryFile,
  serializeWorkGlossaryFile,
  type ParsedWorkGlossaryFile,
  type WorkGlossaryFileError,
} from "../../../../shared/workGlossaryFile";
import {
  applyWorkGlossaryImport,
  planWorkGlossaryImport,
  type WorkGlossaryConflictPolicy,
  type WorkGlossaryImportPlan,
} from "../../../../shared/workGlossaryImportPlan";
import type { MangaApi } from "../../../../shared/mangaApi";
import type { NotificationPort } from "../../lib/notificationPort";
import type { StyleGuideTab } from "./styleGuideTypes";
import { makeLocalId, normalizeGuideForSave, nowIso } from "./styleGuideUtils";

type ComponentsT = TFunction<"components">;

export type StyleGuideImportReview = {
  fileName: string;
  file: ParsedWorkGlossaryFile;
  plan: WorkGlossaryImportPlan;
};

type FileExchangeInput = {
  /** The style guide model's typed library gateway. */
  files: Pick<MangaApi, "openWorkGlossaryFile" | "saveWorkGlossaryFile">;
  guide: WorkStyleGuide | null;
  setGuide: (guide: WorkStyleGuide) => void;
  setTab: (tab: StyleGuideTab) => void;
  workTitle: string;
  notificationPort: NotificationPort;
  t: ComponentsT;
};

/** Export writes a file only; import changes the unsaved draft and never removes entries. */
export function useStyleGuideFileExchange(input: FileExchangeInput) {
  const [fileBusy, setFileBusy] = React.useState(false);
  const [review, setReview] = React.useState<StyleGuideImportReview | null>(
    null,
  );
  const [policy, setPolicy] =
    React.useState<WorkGlossaryConflictPolicy>("keep-existing");
  const showReview = React.useCallback((next: StyleGuideImportReview) => {
    setPolicy("keep-existing");
    setReview(next);
  }, []);
  const exportFile = useGlossaryExport(input, setFileBusy);
  const openImport = useGlossaryImportOpen(input, setFileBusy, showReview);
  const { guide, setGuide, setTab, notificationPort, t } = input;
  const applyImport = React.useCallback(() => {
    if (!guide || !review) return;
    // Re-plan against the current draft so the applied result is what is shown now.
    const plan = planWorkGlossaryImport(guide, review.file);
    const result = applyWorkGlossaryImport(guide, plan, policy, {
      now: nowIso(),
      createId: makeLocalId,
    });
    setGuide(result.guide);
    setTab(
      plan.glossary.added.length || !plan.characters.added.length
        ? "glossary"
        : "characters",
    );
    setReview(null);
    notificationPort.success(
      t("styleGuide.exchange.applied", {
        added: result.added,
        replaced: result.replaced,
      }),
    );
  }, [guide, notificationPort, policy, review, setGuide, setTab, t]);
  return {
    applyImport,
    dismissImport: React.useCallback(() => setReview(null), []),
    exportFile,
    fileBusy,
    importPolicy: policy,
    importReview: review,
    openImport,
    setImportPolicy: setPolicy,
  };
}

function useGlossaryExport(
  { files, guide, workTitle, notificationPort, t }: FileExchangeInput,
  setFileBusy: (busy: boolean) => void,
) {
  return React.useCallback(async () => {
    if (!guide) return;
    const normalized = normalizeGuideForSave(guide);
    const file = buildWorkGlossaryFile(normalized, workTitle, nowIso());
    setFileBusy(true);
    try {
      const saved = await files.saveWorkGlossaryFile({
        defaultName: t("styleGuide.exchange.fileName", { title: workTitle }),
        content: serializeWorkGlossaryFile(file),
      });
      if (!saved) return;
      notificationPort.success(
        t("styleGuide.exchange.exported", {
          glossary: file.glossary.length,
          characters: file.characters.length,
        }),
      );
    } catch (error) {
      console.error(error);
      notificationPort.error(t("styleGuide.exchange.exportFailed"));
    } finally {
      setFileBusy(false);
    }
  }, [files, guide, notificationPort, setFileBusy, t, workTitle]);
}

function useGlossaryImportOpen(
  { files, guide, notificationPort, t }: FileExchangeInput,
  setFileBusy: (busy: boolean) => void,
  showReview: (review: StyleGuideImportReview) => void,
) {
  return React.useCallback(async () => {
    if (!guide) return;
    setFileBusy(true);
    try {
      const opened = await files.openWorkGlossaryFile();
      if (!opened) return;
      if ("tooLarge" in opened) {
        notificationPort.error(t("styleGuide.exchange.errors.too-large"));
        return;
      }
      const parsed = parseWorkGlossaryFile(opened.content);
      if (!parsed.ok) {
        notificationPort.error(fileErrorMessage(parsed, t));
        return;
      }
      showReview({
        fileName: fileNameOf(opened.path),
        file: parsed.file,
        plan: planWorkGlossaryImport(guide, parsed.file),
      });
    } catch (error) {
      console.error(error);
      notificationPort.error(t("styleGuide.exchange.openFailed"));
    } finally {
      setFileBusy(false);
    }
  }, [files, guide, notificationPort, setFileBusy, showReview, t]);
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/u).pop() || path;
}

function fileErrorMessage(
  parsed: { error: WorkGlossaryFileError; invalidCount: number },
  t: ComponentsT,
): string {
  if (parsed.error === "empty" && parsed.invalidCount > 0)
    return t("styleGuide.exchange.errors.emptyInvalid", {
      count: parsed.invalidCount,
    });
  return t(`styleGuide.exchange.errors.${parsed.error}`);
}
