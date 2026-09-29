import { SoundEffectImageRecoveryAction } from "./SoundEffectImageRecoveryAction";
import {
  ImageTranslationOptions,
  type ImageTranslationChoices,
} from "./ImageTranslationOptions";
import React from "react";
import { useTranslation } from "react-i18next";
import type {
  PrepareSoundEffectTranslationRequest,
  SoundEffectImageRecovery,
  RestoreSoundEffectReviewRequest,
} from "../../../shared/analysisTypes";
import type { ChapterSnapshot } from "../../../shared/libraryTypes";
import type { UiSettings } from "../../../shared/settingsTypes";
import {
  PagePickerModalActionButtons,
  PagePickerModalCheckbox,
  PagePickerModalShell,
} from "./PagePickerModalShell";
import { SoundEffectTranslationReviewPicker } from "./SoundEffectTranslationReviewPicker";
import styles from "./SoundEffectTranslationModal.module.css";
import { useSoundEffectTranslationModalState } from "./useSoundEffectTranslationModalState";
import type { AppSettings } from "../../../shared/settingsTypes";
import { canUseCodexImages } from "../../../shared/codexCapabilities";
import { useCodexConnection } from "../hooks/useCodexConnection";

export type SoundEffectTranslationModalProps = {
  settings?: AppSettings | null;
  sfxRenderingDefault?: "image" | "font";
  chapter: ChapterSnapshot;
  /** A job the current translation provider cannot run beside. */
  jobActive: boolean;
  /** Any model job; erasing afterwards needs the local model to itself. */
  modelResourceBusy?: boolean;
  autoFontMatchingDefault?: boolean;
  inpaintAfterTranslationDefault?: boolean;
  onClose: () => void;
  onResume?: (recovery: SoundEffectImageRecovery) => void;
  onRestore?: (
    request: RestoreSoundEffectReviewRequest,
  ) => Promise<ChapterSnapshot>;
  onPersistDefaults?: (patch: Partial<UiSettings>) => void;
  onStart: (
    request: PrepareSoundEffectTranslationRequest,
    inpaintAfterTranslation: boolean,
    autoFontMatching: boolean,
    sfxRendering?: "image" | "font",
  ) => void | Promise<void>;
};

export function SoundEffectTranslationModal({
  settings = null,
  sfxRenderingDefault = "image",
  chapter,
  jobActive,
  modelResourceBusy = jobActive,
  autoFontMatchingDefault = false,
  inpaintAfterTranslationDefault = false,
  onClose,
  onRestore,
  onPersistDefaults,
  onStart,
  onResume,
}: SoundEffectTranslationModalProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const execution = useSoundEffectExecution({
    settings,
    sfxRenderingDefault,
    jobActive,
  });
  const { sfxRendering } = execution;
  const state = useSoundEffectTranslationModalState({
    chapter,
    jobActive,
    autoFontMatchingDefault,
    inpaintAfterTranslationDefault,
    onClose,
    onRestore,
    onPersistDefaults,
    onStart: (request, erase, font) =>
      execution.output === "image" ||
      (erase && execution.eraseEngine === "codex")
        ? onStart(request, erase, sfxRendering === "font" && font, sfxRendering)
        : onStart(request, erase, font),
  });

  const busy = jobActive || state.resetReview.busy;
  const executionDisabled = isSoundEffectRunDisabled({
    busy,
    modelResourceBusy,
    inpaintAfterTranslation: state.inpaintAfterTranslation,
    execution,
  });
  return (
    <PagePickerModalShell
      title={t("soundEffectReview.modalTitle")}
      width="min(1480px, 100%)"
      onClose={onClose}
      onKeyDown={state.onKeyDown}
      closeDisabled={state.resetReview.busy}
      bodyClassName={styles.modalBody}
      footerActions={
        <SoundEffectTranslationActions
          state={state}
          disabled={executionDisabled}
          onClose={onClose}
          chapter={chapter}
          onResume={onResume}
          codexAvailable={execution.codexAvailable}
        />
      }
      footerLeading={
        <SoundEffectTranslationFooter {...execution} state={state} />
      }
    >
      <SoundEffectTranslationReviewPicker
        chapterTitle={chapter.title}
        disabled={busy}
        resetReview={state.resetReview}
        draftPages={state.draftPages}
        selectedRegion={state.selectedRegion}
        showAllPages={state.showAllPages}
        showTranslations={state.showTranslations}
        onDraftChange={state.setDraftPages}
        onSelectedRegionChange={state.setSelectedRegion}
        onShowAllPagesChange={state.setShowAllPages}
        onShowTranslationsChange={state.setShowTranslations}
      />
    </PagePickerModalShell>
  );
}

function SoundEffectTranslationActions({
  state,
  disabled,
  onClose,
  chapter,
  onResume,
  codexAvailable,
}: Pick<SoundEffectTranslationModalProps, "chapter" | "onResume"> & {
  codexAvailable: boolean;
  state: ReturnType<typeof useSoundEffectTranslationModalState>;
  disabled: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation("components");
  return (
    <>
      {onResume && (
        <SoundEffectImageRecoveryAction
          chapter={chapter}
          disabled={state.resetReview.busy || !codexAvailable}
          onResume={onResume}
        />
      )}
      <PagePickerModalActionButtons
        cancel={{
          label: t("common.cancel"),
          onClick: onClose,
          disabled: state.resetReview.busy,
        }}
        confirm={{
          label: t(
            state.includedCount > 0
              ? "soundEffectReview.startSelected"
              : "soundEffectReview.reviewComplete",
            { count: state.includedCount },
          ),
          onClick: state.start,
          disabled: disabled || state.prepareRequest.pages.length === 0,
        }}
      />
    </>
  );
}

function useSoundEffectExecution({
  settings,
}: Required<
  Pick<
    SoundEffectTranslationModalProps,
    "settings" | "sfxRenderingDefault" | "jobActive"
  >
>) {
  const [output, setOutput] = React.useState<"text" | "image">("text");
  const [eraseEngine, setEraseEngine] = React.useState<"default" | "codex">(
    "default",
  );
  const { account } = useCodexConnection(Boolean(settings));
  const codexAvailable = canUseCodexImages(settings, account);
  return {
    output,
    setOutput,
    eraseEngine,
    setEraseEngine,
    sfxRendering: output === "image" ? ("image" as const) : ("font" as const),
    codexAvailable,
  };
}

function SoundEffectTranslationFooter({
  output,
  setOutput,
  eraseEngine,
  setEraseEngine,
  codexAvailable,
  state,
}: ReturnType<typeof useSoundEffectExecution> & {
  state: ReturnType<typeof useSoundEffectTranslationModalState>;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const change = (value: ImageTranslationChoices) => {
    setOutput(value.output);
    setEraseEngine(value.eraseEngine ?? "default");
    state.setInpaintAfterTranslation(value.eraseOriginal);
  };
  return (
    <div className={styles.executionOptions}>
      <ImageTranslationOptions
        value={{
          output,
          eraseOriginal: state.inpaintAfterTranslation,
          eraseEngine,
        }}
        onChange={change}
        available={codexAvailable}
      />
      {output === "text" ? (
        <PagePickerModalCheckbox
          checked={state.autoFontMatching}
          label={t("translationOptions.autoFontMatching")}
          onCheckedChange={state.setAutoFontMatching}
          variant="switch"
        />
      ) : null}
      <PagePickerModalCheckbox
        checked={state.saveDefaults}
        label={t("soundEffectReview.saveAsDefault")}
        onCheckedChange={state.setSaveDefaults}
      />
    </div>
  );
}

/** Erasing afterwards needs the local model to itself; Codex needs a login. */
function isSoundEffectRunDisabled({
  busy,
  modelResourceBusy,
  inpaintAfterTranslation,
  execution,
}: {
  busy: boolean;
  modelResourceBusy: boolean;
  inpaintAfterTranslation: boolean;
  execution: Pick<
    ReturnType<typeof useSoundEffectExecution>,
    "output" | "eraseEngine" | "codexAvailable"
  >;
}): boolean {
  const useCodex =
    execution.output === "image" ||
    (inpaintAfterTranslation && execution.eraseEngine === "codex");
  return (
    busy ||
    (inpaintAfterTranslation && modelResourceBusy) ||
    (useCodex && !execution.codexAvailable)
  );
}
