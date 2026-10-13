import React from "react";
import { useTranslation } from "react-i18next";
import type { useImportModalState } from "./useImportModalState";
import { CheckboxField } from "./ui/CheckboxField";
import { ControlTooltip } from "./ui/ControlTooltip";
import { ImportLinkedWorkspaceSection } from "./ImportLinkedWorkspaceSection";
import styles from "./ImportBatchOptions.module.css";

type ImportModalState = ReturnType<typeof useImportModalState>;
type BatchOptions = ImportModalState["batchOptions"];

/** Choices below the chapter list: what happens with the imported result. */
export function ImportFollowUpOptions({
  busy,
  state,
}: {
  busy: boolean;
  state: ImportModalState;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return state.mode === "pages" ? (
    <CheckboxField
      checked={state.translateAddedPages}
      disabled={busy}
      onCheckedChange={state.setTranslateAddedPages}
      label={t("import.translateAddedPages")}
    />
  ) : (
    <ImportLinkedWorkspaceSection
      busy={busy}
      options={state.linkedWorkspace}
      onChange={state.setLinkedWorkspace}
    />
  );
}

/**
 * Batch choices shown before the candidate list, so the duplicate rule and
 * its counts are visible while titles are reviewed.
 */
export function ImportBatchOptions({
  busy,
  state,
}: {
  busy: boolean;
  state: ImportModalState;
}): React.JSX.Element | null {
  const { t } = useTranslation("components");
  const options = state.batchOptions;
  const existingTarget = state.targetMode === "existing";
  if (state.mode === "pages" || !options.batch) return null;
  return (
    <section className={`modal-section ${styles.options}`}>
      <div className={styles.option}>
        <CheckboxField
          checked={options.openTranslationAfterImport}
          disabled={busy}
          label={t("import.batchOptions.openTranslation")}
          onCheckedChange={options.setOpenTranslationAfterImport}
        />
      </div>
      {existingTarget ? (
        <div className={styles.option}>
          <ControlTooltip
            floating
            content={t("import.batchOptions.skipDuplicatesHint")}
          >
            {(descriptionId) => (
              <CheckboxField
                checked={options.skipDuplicateChapterTitles}
                disabled={busy}
                ariaDescribedBy={descriptionId}
                label={t("import.batchOptions.skipDuplicates")}
                onCheckedChange={options.setSkipDuplicateChapterTitles}
              />
            )}
          </ControlTooltip>
          {options.skipActive ? <DuplicateCounts options={options} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function DuplicateCounts({
  options,
}: {
  options: BatchOptions;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const skipped = options.duplicates.skippedDraftIds.size;
  const remaining = options.duplicates.selectedCount - skipped;
  return (
    <p className={styles.counts} role="status">
      {skipped === 0
        ? t("import.batchOptions.noDuplicates", {
            count: options.duplicates.selectedCount,
          })
        : remaining === 0
          ? t("import.batchOptions.allDuplicates", { count: skipped })
          : t("import.batchOptions.duplicateCounts", { skipped, remaining })}
    </p>
  );
}
