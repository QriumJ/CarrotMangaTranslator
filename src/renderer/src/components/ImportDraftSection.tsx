import React from "react";

import { useTranslation } from "react-i18next";

import type {
  ImportCreateSelection,
  ImportPreviewResult,
} from "../../../shared/importTypes";

import {
  updateSelectionEnabled,
  updateSelectionTitle,
} from "./importModalHelpers";

import { CheckboxField } from "./ui/CheckboxField";

import { Input } from "./ui/Field";

import { SelectionSurface } from "./ui/SelectionCard";

export function ImportDraftSection({
  busy,
  preview,
  selections,
  setSelections,
  pagesOnly = false,
}: {
  busy: boolean;
  preview: ImportPreviewResult;
  selections: ImportCreateSelection[];
  setSelections: React.Dispatch<React.SetStateAction<ImportCreateSelection[]>>;
  pagesOnly?: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <section className="modal-section">
      <h3>
        {t(
          pagesOnly
            ? "import.pagesToAdd"
            : preview.mode === "batch"
              ? "import.chaptersToCreate"
              : "import.chapterTitle",
        )}
      </h3>
      <div className="draft-list">
        {preview.chapters.map((chapter) => {
          const selection = selections.find(
            (item) => item.draftId === chapter.draftId,
          );
          return selection ? (
            <ImportDraftItem
              key={chapter.draftId}
              busy={busy}
              chapter={chapter}
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

function ImportDraftItem({
  busy,
  chapter,
  previewMode,
  selection,
  setSelections,
  pagesOnly,
}: {
  busy: boolean;
  chapter: ImportPreviewResult["chapters"][number];
  previewMode: ImportPreviewResult["mode"];
  selection: ImportCreateSelection;
  setSelections: React.Dispatch<React.SetStateAction<ImportCreateSelection[]>>;
  pagesOnly: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <SelectionSurface
      className="draft-item selection-field-row"
      variant="row"
      selected={previewMode === "batch" ? selection.enabled : true}
      disabled={busy}
    >
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
        <Input
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
      )}
    </SelectionSurface>
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
      className="checkbox-row"
      ariaLabel={`${selection.title} · ${t("common.pageCount", { count: chapter.pages.length })}`}
      label={t("common.pageCount", { count: chapter.pages.length })}
      checked={selection.enabled}
      disabled={busy}
      onCheckedChange={(checked) =>
        updateSelectionEnabled(setSelections, chapter.draftId, checked)
      }
    />
  );
}
