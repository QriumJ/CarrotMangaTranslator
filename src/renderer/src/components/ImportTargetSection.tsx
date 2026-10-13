import React from "react";
import { useTranslation } from "react-i18next";
import type { LibraryIndex } from "../../../shared/libraryTypes";
import type { ImportTargetMode } from "./importModalHelpers";
import { TextField } from "./ui/Field";
import { SegmentedControl } from "./ui/SegmentedControl";
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
      <SegmentedControl
        ariaLabel={t("import.selectWork")}
        value={targetMode}
        disabled={busy}
        onChange={setTargetMode}
        options={[
          { id: "new", label: t("import.createNewWork") },
          {
            id: "existing",
            label: t(
              currentWorkId
                ? "import.addToCurrentWork"
                : "import.addToExistingWork",
            ),
            disabled: library.works.length === 0,
          },
        ]}
      />
      {targetMode === "new" ? (
        <TextField
          label={t("common.workTitle")}
          value={newWorkTitle}
          disabled={busy}
          onChange={(event) => setNewWorkTitle(event.target.value)}
        />
      ) : (
        <ImportExistingWorkSelect
          busy={busy}
          existingWorkId={existingWorkId}
          library={library}
          setExistingWorkId={setExistingWorkId}
        />
      )}
    </section>
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
