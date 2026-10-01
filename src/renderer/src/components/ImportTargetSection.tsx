import React from "react";
import { useTranslation } from "react-i18next";
import type { LibraryIndex } from "../../../shared/libraryTypes";
import type { ImportTargetMode } from "./importModalHelpers";
import { TextField } from "./ui/Field";
import { SelectionCard } from "./ui/SelectionCard";
import { WorkSelect } from "./WorkSelect";

export function ImportTargetSection({
  busy,
  currentWorkId,
  existingWorkId,
  library,
  newWorkTitle,
  setExistingWorkId,
  setNewWorkTitle,
  setTargetMode,
  targetMode,
}: {
  busy: boolean;
  currentWorkId: string | null;
  existingWorkId: string;
  library: LibraryIndex;
  newWorkTitle: string;
  setExistingWorkId: React.Dispatch<React.SetStateAction<string>>;
  setNewWorkTitle: React.Dispatch<React.SetStateAction<string>>;
  setTargetMode: React.Dispatch<React.SetStateAction<ImportTargetMode>>;
  targetMode: ImportTargetMode;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <section className="modal-section share-target-section">
      <div className="share-target-grid">
        <ImportTargetModeCard
          active={targetMode === "new"}
          disabled={busy}
          label={t("import.createNewWork")}
          mode="new"
          onChange={setTargetMode}
        />
        <ImportTargetModeCard
          active={targetMode === "existing"}
          disabled={busy || library.works.length === 0}
          label={
            currentWorkId
              ? t("import.addToCurrentWork")
              : t("import.addToExistingWork")
          }
          mode="existing"
          onChange={setTargetMode}
        />
      </div>
      {targetMode === "new" ? (
        <TextField
          label={t("common.workTitle")}
          value={newWorkTitle}
          disabled={busy}
          onChange={(event) => setNewWorkTitle(event.target.value)}
        />
      ) : (
        <>
          {currentWorkId && existingWorkId === currentWorkId ? (
            <p className="import-current-target-note" role="status">
              {t("import.currentWorkDefault")}
            </p>
          ) : null}
          <ImportExistingWorkSelect
            busy={busy}
            existingWorkId={existingWorkId}
            library={library}
            setExistingWorkId={setExistingWorkId}
          />
        </>
      )}
    </section>
  );
}

function ImportTargetModeCard({
  active,
  disabled,
  label,
  mode,
  onChange,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  mode: ImportTargetMode;
  onChange: React.Dispatch<React.SetStateAction<ImportTargetMode>>;
}): React.JSX.Element {
  return (
    <SelectionCard
      className="share-target-card"
      inputType="radio"
      name="target-mode"
      checked={active}
      disabled={disabled}
      onChange={() => onChange(mode)}
    >
      <span>{label}</span>
    </SelectionCard>
  );
}

function ImportExistingWorkSelect({
  busy,
  existingWorkId,
  library,
  setExistingWorkId,
}: {
  busy: boolean;
  existingWorkId: string;
  library: LibraryIndex;
  setExistingWorkId: React.Dispatch<React.SetStateAction<string>>;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <label>
      {t("import.selectWork")}
      <WorkSelect
        ariaLabel={t("import.selectWork")}
        library={library}
        value={existingWorkId}
        disabled={busy || library.works.length === 0}
        onValueChange={setExistingWorkId}
      />
    </label>
  );
}
