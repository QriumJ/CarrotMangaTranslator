import React from "react";

import { useTranslation } from "react-i18next";

import type {
  ImportCreateSelection,
  ImportPreviewResult,
} from "../../../shared/importTypes";

import {
  setAllSelectionsEnabled,
  updateSelectionEnabled,
  updateSelectionTitle,
} from "./importModalHelpers";

import { Button } from "./ui/Button";

import { CheckboxField } from "./ui/CheckboxField";

import { Input } from "./ui/Field";

import { ControlTooltip } from "./ui/ControlTooltip";

import styles from "./ImportBatchOptions.module.css";

const NO_SKIPPED_DRAFTS: ReadonlySet<string> = new Set();

export function ImportDraftSection({
  busy,
  preview,
  selections,
  setSelections,
  pagesOnly = false,
  skippedDraftIds = NO_SKIPPED_DRAFTS,
}: {
  busy: boolean;
  preview: ImportPreviewResult;
  selections: ImportCreateSelection[];
  setSelections: React.Dispatch<React.SetStateAction<ImportCreateSelection[]>>;
  pagesOnly?: boolean;
  /** Chapters an existing-work import will leave out for a duplicate title. */
  skippedDraftIds?: ReadonlySet<string>;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const batch = preview.mode === "batch";
  return (
    <section className="modal-section">
      <h3>
        {t(
          pagesOnly
            ? "import.pagesToAdd"
            : batch
              ? "import.chaptersToCreate"
              : "import.chapterTitle",
        )}
      </h3>
      {batch ? (
        <ImportDraftBulkBar
          busy={busy}
          selections={selections}
          setSelections={setSelections}
        />
      ) : null}
      <div className={styles.draftList}>
        {preview.chapters.map((chapter) => {
          const selection = selections.find(
            (item) => item.draftId === chapter.draftId,
          );
          return selection ? (
            <ImportDraftItem
              key={chapter.draftId}
              busy={busy}
              chapter={chapter}
              duplicate={skippedDraftIds.has(chapter.draftId)}
              previewMode={preview.mode}
              selection={selection}
              setSelections={setSelections}
              pagesOnly={pagesOnly}
            />
          ) : null;
        })}
      </div>
    </section>
  );
}

function ImportDraftBulkBar({
  busy,
  selections,
  setSelections,
}: {
  busy: boolean;
  selections: ImportCreateSelection[];
  setSelections: React.Dispatch<React.SetStateAction<ImportCreateSelection[]>>;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const selected = selections.filter((item) => item.enabled).length;
  return (
    <div className={styles.bulkBar}>
      <span className={styles.bulkCount} role="status">
        {t("import.selectedChapters", {
          selected,
          total: selections.length,
        })}
      </span>
      <div className={styles.bulkActions}>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || selected === selections.length}
          onClick={() => setAllSelectionsEnabled(setSelections, true)}
        >
          {t("common.selectAll")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || selected === 0}
          onClick={() => setAllSelectionsEnabled(setSelections, false)}
        >
          {t("common.clearAll")}
        </Button>
      </div>
    </div>
  );
}

function ImportDraftItem({
  busy,
  chapter,
  duplicate,
  previewMode,
  selection,
  setSelections,
  pagesOnly,
}: {
  busy: boolean;
  chapter: ImportPreviewResult["chapters"][number];
  duplicate: boolean;
  previewMode: ImportPreviewResult["mode"];
  selection: ImportCreateSelection;
  setSelections: React.Dispatch<React.SetStateAction<ImportCreateSelection[]>>;
  pagesOnly: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const sourcePath = chapter.pages[0]?.sourceRelativePath;
  return (
    <div className={styles.draftRow}>
      {previewMode === "batch" ? (
        <ImportDraftBatchToggle
          busy={busy}
          chapter={chapter}
          selection={selection}
          setSelections={setSelections}
        />
      ) : (
        <span className="draft-meta">
          {t("common.pageCount", { count: chapter.pages.length })}
        </span>
      )}
      {pagesOnly ? (
        <span>{chapter.title}</span>
      ) : (
        <ControlTooltip floating content={sourcePath ?? selection.title}>
          <Input
            aria-label={t("import.chapterTitle")}
            value={selection.title}
            disabled={busy || (previewMode === "batch" && !selection.enabled)}
            onChange={(event) =>
              updateSelectionTitle(
                setSelections,
                chapter.draftId,
                event.target.value,
              )
            }
          />
        </ControlTooltip>
      )}
      <span className={styles.draftMeta}>
        {previewMode === "batch"
          ? t("common.pageCount", { count: chapter.pages.length })
          : null}
        {duplicate ? (
          <span className={styles.duplicate}>{t("import.duplicateTitle")}</span>
        ) : null}
      </span>
    </div>
  );
}

function ImportDraftBatchToggle({
  busy,
  chapter,
  selection,
  setSelections,
}: {
  busy: boolean;
  chapter: ImportPreviewResult["chapters"][number];
  selection: ImportCreateSelection;
  setSelections: React.Dispatch<React.SetStateAction<ImportCreateSelection[]>>;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <CheckboxField
      ariaLabel={`${selection.title} · ${t("common.pageCount", { count: chapter.pages.length })}`}
      checked={selection.enabled}
      disabled={busy}
      onCheckedChange={(checked) =>
        updateSelectionEnabled(setSelections, chapter.draftId, checked)
      }
    />
  );
}
