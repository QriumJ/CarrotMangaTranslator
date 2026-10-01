import { ImportTargetSection } from "./ImportTargetSection";
import { ImportExcludedPagesNotice } from "./ImportExcludedPagesNotice";
import React from "react";

import { useTranslation } from "react-i18next";

import type { ImportPreviewResult } from "../../../shared/importTypes";

import type {
  ChapterSnapshot,
  LibraryIndex,
} from "../../../shared/libraryTypes";

import type { ImportModalSubmit } from "../lib/importFlowTypes";

import { useImportModalState } from "./useImportModalState";
import { ImportChapterPagesFields } from "./ImportChapterPagesFields";

import { Button } from "./ui/Button";

import { Modal } from "./ui/Modal";

import { ModalActionBar } from "./ui/ModalActionBar";

import { ImportLinkedWorkspaceSection } from "./ImportLinkedWorkspaceSection";

import { InlineMessage } from "./ui/InlineMessage";

import type { ImportModalFeedback } from "../lib/importFlowTypes";

import { SegmentedControl } from "./ui/SegmentedControl";
import { CheckboxField } from "./ui/CheckboxField";

import { ImportDraftSection } from "./ImportDraftSection";

type ImportModalProps = {
  library: LibraryIndex;
  currentWorkId?: string | null;
  currentChapterId?: string | null;
  addPagesChapter?: ChapterSnapshot | null;
  preview: ImportPreviewResult;
  busy: boolean;
  initialDraft?: ImportModalSubmit | null;
  feedback?: ImportModalFeedback | null;
  onCancel: () => void;
  onEntered?: () => void;
  onSubmit: (payload: ImportModalSubmit) => void;
};

export function ImportModal({
  library,
  currentWorkId = null,
  currentChapterId = null,
  addPagesChapter = null,
  preview,
  busy,
  initialDraft = null,
  feedback = null,
  onCancel,
  onEntered,
  onSubmit,
}: ImportModalProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const state = useImportModalState({
    library,
    currentWorkId,
    currentChapterId,
    addPagesChapter,
    preview,
    initialDraft,
  });

  const modalTitle = resolveImportModalTitle(t, preview.mode);

  return (
    <Modal
      title={modalTitle}
      onEntered={onEntered}
      onClose={onCancel}
      closeDisabled={busy}
      footer={
        <ImportModalFooter
          busy={busy}
          onCancel={onCancel}
          onSubmit={() => onSubmit(state.submitPayload)}
          previewMode={preview.mode}
          submittable={state.submittable}
          pagesOnly={state.mode === "pages"}
        />
      }
    >
      <SegmentedControl
        ariaLabel={t("import.addToLibrary")}
        value={state.mode}
        onChange={state.setMode}
        disabled={busy}
        options={[
          { id: "chapters", label: t("import.addChapter") },
          {
            id: "pages",
            label: t("import.addPages"),
            disabled: !library.works.some((work) => work.chapters.length > 0),
          },
        ]}
      />
      <ImportModalContent
        busy={busy}
        library={library}
        preview={preview}
        state={state}
        feedback={feedback}
      />
    </Modal>
  );
}

function ImportModalContent({
  busy,
  library,
  preview,
  state,
  feedback,
}: {
  busy: boolean;
  library: LibraryIndex;
  preview: ImportPreviewResult;
  state: ReturnType<typeof useImportModalState>;
  feedback: ImportModalFeedback | null;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const pagesOnly = state.mode === "pages";
  return (
    <>
      {feedback ? (
        <InlineMessage variant={feedback.variant} title={feedback.message} />
      ) : null}
      <ImportExcludedPagesNotice preview={preview} />
      {pagesOnly ? (
        <ImportChapterPagesFields library={library} state={state} busy={busy} />
      ) : (
        <ImportTargetSection
          busy={busy}
          existingWorkId={state.existingWorkId}
          currentWorkId={state.currentWorkId}
          library={library}
          newWorkTitle={state.newWorkTitle}
          setExistingWorkId={state.setExistingWorkId}
          setNewWorkTitle={state.setNewWorkTitle}
          setTargetMode={state.setTargetMode}
          targetMode={state.targetMode}
        />
      )}
      <ImportDraftSection
        busy={busy}
        preview={preview}
        selections={state.selections}
        setSelections={state.setSelections}
        pagesOnly={pagesOnly}
      />
      {pagesOnly ? (
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
      )}
    </>
  );
}

function resolveImportModalTitle(
  t: ReturnType<typeof useTranslation>["t"],
  mode: ImportPreviewResult["mode"],
): string {
  return t(mode === "batch" ? "import.batchTitle" : "import.addToLibrary");
}

function ImportModalFooter({
  busy,
  onCancel,
  onSubmit,
  previewMode,
  submittable,
  pagesOnly,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  previewMode: ImportPreviewResult["mode"];
  submittable: boolean;
  pagesOnly: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <ModalActionBar
      actions={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !submittable}
            onClick={onSubmit}
          >
            {t(
              pagesOnly
                ? "import.addPages"
                : previewMode === "batch"
                  ? "import.createAndTranslate"
                  : "import.addToLibrary",
            )}
          </Button>
        </>
      }
    />
  );
}
