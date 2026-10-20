import React from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../../../shared/settingsTypes";
import type { ChapterSnapshot } from "../../../shared/libraryTypes";
import type { WorkContextResearchProposal } from "../../../shared/workContextResearchTypes";
import { Button } from "./ui/Button";
import { Modal } from "./ui/Modal";
import { ModalActionBar, ModalActionButtons } from "./ui/ModalActionBar";
import { ConfirmModal } from "./ConfirmModal";
import { useConfirmDialog } from "../hooks/useConfirmDialog";
import {
  toastNotificationPort,
  type NotificationPort,
} from "../lib/notificationPort";
import {
  StyleGuideAnalysisActions,
  StyleGuideBudgetSummary,
  StyleGuideTabContent,
  StyleGuideTabs,
} from "./styleGuide/StyleGuideChrome";
import { useStyleGuideModalModel } from "./styleGuide/useStyleGuideModalModel";
import { StyleGuideResearchReview } from "./styleGuide/StyleGuideResearchReview";
import {
  StyleGuideFileActions,
  StyleGuideImportReviewModal,
  StyleGuideTabBar,
} from "./styleGuide/StyleGuideFileExchange";
import { StyleGuideResearchSetupContent } from "./styleGuide/StyleGuideResearchSetupContent";
import { useStyleGuideResearchSetup } from "./styleGuide/useStyleGuideResearchSetup";

type StyleGuideModalProps = {
  chapter: ChapterSnapshot | null;
  workId?: string;
  workTitle: string;
  jobActive?: boolean;
  notificationPort?: NotificationPort;
  settings: AppSettings | null;
  onSaveSettings?: (settings: AppSettings) => Promise<AppSettings | null>;
  onBackgroundStateChange?: (backgrounded: boolean) => void;
  onClose: () => void;
};

export function StyleGuideModal({
  chapter,
  workId,
  workTitle,
  jobActive = false,
  notificationPort = toastNotificationPort,
  settings,
  onSaveSettings,
  onBackgroundStateChange,
  onClose,
}: StyleGuideModalProps): React.JSX.Element {
  const model = useStyleGuideModalModel(
    chapter,
    workTitle,
    settings,
    notificationPort,
    workId,
  );
  const [researchSetupOpen, setResearchSetupOpen] = React.useState(false);
  const [returningFromImport, setReturningFromImport] = React.useState(false);
  const { confirm, confirmAndReset } = useStyleGuidePresentation(
    model,
    onBackgroundStateChange,
  );
  return (
    <>
      {!model.analyzing &&
      !researchSetupOpen &&
      !model.proposal &&
      !model.exchange.importReview ? (
        <StyleGuidePrimaryModal
          focusImport={returningFromImport}
          jobActive={jobActive}
          model={model}
          onImport={() => {
            setReturningFromImport(true);
            void model.exchange.openImport();
          }}
          onAnalyze={() => {
            setReturningFromImport(false);
            setResearchSetupOpen(true);
          }}
          onClose={onClose}
          onReset={confirmAndReset}
        />
      ) : null}
      {researchSetupOpen && !model.analyzing ? (
        <StyleGuideResearchSetupModal
          engine={model.researchEngine}
          initialTitle={model.researchTitle}
          settings={settings}
          onDismiss={() => setResearchSetupOpen(false)}
          onSaveSettings={onSaveSettings}
          onSaveTitle={model.saveResearchTitle}
          onStart={model.researchWithInternet}
        />
      ) : null}
      {model.proposal ? (
        <StyleGuideResearchReviewModal
          proposal={model.proposal}
          selectedIds={model.selectedOperationIds}
          onSelectedIdsChange={model.setSelectedOperationIds}
          onApply={model.applySelectedProposal}
          onDismiss={model.dismissProposal}
        />
      ) : null}
      <StyleGuideImportReviewModal exchange={model.exchange} />
      {confirm.confirmDialog ? (
        <ConfirmModal
          {...confirm.confirmDialog}
          onCancel={() => confirm.resolveConfirmDialog(false)}
          onConfirm={() => confirm.resolveConfirmDialog(true)}
        />
      ) : null}
    </>
  );
}

function useStyleGuidePresentation(
  model: ReturnType<typeof useStyleGuideModalModel>,
  onBackgroundStateChange: StyleGuideModalProps["onBackgroundStateChange"],
) {
  const { t } = useTranslation("components");
  React.useEffect(
    () => onBackgroundStateChange?.(model.analyzing),
    [model.analyzing, onBackgroundStateChange],
  );
  React.useEffect(
    () => () => onBackgroundStateChange?.(false),
    [onBackgroundStateChange],
  );
  const confirm = useConfirmDialog();
  const confirmAndReset = async (): Promise<void> => {
    const approved = await confirm.askConfirm(
      t("styleGuide.reset.button"),
      t("styleGuide.reset.message"),
      t("styleGuide.reset.detail"),
    );
    if (approved) {
      await model.resetAllWorkContext();
    }
  };
  return { confirm, confirmAndReset };
}

function StyleGuidePrimaryModal({
  onImport,
  focusImport,
  jobActive,
  model,
  onAnalyze,
  onClose,
  onReset,
}: {
  onImport: () => void;
  focusImport: boolean;
  jobActive: boolean;
  model: ReturnType<typeof useStyleGuideModalModel>;
  onAnalyze: () => void;
  onClose: () => void;
  onReset: () => Promise<void>;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <Modal
      title={t("styleGuide.title")}
      size="xl"
      onClose={onClose}
      closeDisabled={model.resetting}
      bodyClassName="style-guide-body"
      footer={
        <StyleGuideFooter
          jobActive={jobActive}
          model={model}
          onClose={onClose}
          onReset={onReset}
        />
      }
    >
      {model.chapterAvailable ? (
        <StyleGuideAnalysisActions
          analyzing={model.analyzing}
          disabled={model.working || !model.chapterAvailable}
          engine={model.researchEngine}
          onEngineChange={model.setResearchEngine}
          onAnalyze={onAnalyze}
        />
      ) : null}

      <StyleGuideTabBar
        tabs={
          <StyleGuideTabs
            active={model.tab}
            onChange={model.setTab}
            chapterAvailable={model.chapterAvailable}
          />
        }
        actions={
          <StyleGuideFileActions
            focusImport={focusImport}
            busy={model.exchange.fileBusy}
            disabled={!model.guide || model.working}
            exportDisabled={
              !model.guide?.glossary.length && !model.guide?.characters.length
            }
            onExport={() => void model.exchange.exportFile()}
            onImport={onImport}
          />
        }
      />
      <StyleGuideTabContent
        busy={model.busy}
        guide={model.guide}
        memory={model.memory}
        onGuideChange={model.setGuide}
        onMemoryChange={model.setMemory}
        tab={model.tab}
        usage={model.usage}
        usageStatus={model.usageStatus}
      />
    </Modal>
  );
}

function StyleGuideResearchSetupModal({
  engine,
  initialTitle,
  settings,
  onDismiss,
  onSaveSettings,
  onSaveTitle,
  onStart,
}: {
  engine: ReturnType<typeof useStyleGuideModalModel>["researchEngine"];
  initialTitle: string;
  settings: AppSettings | null;
  onDismiss: () => void;
  onSaveSettings?: (settings: AppSettings) => Promise<AppSettings | null>;
  onSaveTitle: (title: string) => Promise<string>;
  onStart: (title: string) => Promise<void>;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const controller = useStyleGuideResearchSetup({
    engine,
    initialTitle,
    settings,
    onDismiss,
    onSaveSettings,
    onSaveTitle,
    onStart,
  });

  return (
    <Modal
      title={t("styleGuide.research.setupTitle")}
      size="md"
      onClose={onDismiss}
      closeDisabled={controller.busy}
      bodyClassName="style-guide-research-setup-body"
      footer={
        <ModalActionBar
          actions={
            <ModalActionButtons
              cancel={{
                label: t("common.cancel"),
                onClick: onDismiss,
                disabled: controller.busy,
              }}
              confirm={{
                label: t(
                  controller.busy
                    ? "styleGuide.research.preparing"
                    : "styleGuide.research.start",
                ),
                onClick: () => void controller.startResearch(),
                disabled: !controller.canStart,
              }}
            />
          }
        />
      }
    >
      <StyleGuideResearchSetupContent controller={controller} engine={engine} />
    </Modal>
  );
}

function StyleGuideResearchReviewModal({
  proposal,
  selectedIds,
  onSelectedIdsChange,
  onApply,
  onDismiss,
}: {
  proposal: WorkContextResearchProposal;
  selectedIds: ReadonlySet<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onApply: () => void;
  onDismiss: () => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <Modal
      title={t("styleGuide.research.reviewTitle")}
      size="xl"
      maxHeight="900px"
      fillHeight
      bodyLayout="flex"
      bodyClassName="style-guide-research-review-body"
      onClose={onDismiss}
      footer={
        <ModalActionBar
          actions={
            <ModalActionButtons
              cancel={{ label: t("common.cancel"), onClick: onDismiss }}
              confirm={{
                label: t("styleGuide.research.apply", {
                  count: selectedIds.size,
                }),
                onClick: onApply,
                disabled: selectedIds.size === 0,
              }}
            />
          }
        />
      }
    >
      <StyleGuideResearchReview
        proposal={proposal}
        selectedIds={selectedIds}
        onSelectedIdsChange={onSelectedIdsChange}
      />
    </Modal>
  );
}

function StyleGuideFooter({
  jobActive,
  model,
  onClose,
  onReset,
}: {
  jobActive: boolean;
  model: ReturnType<typeof useStyleGuideModalModel>;
  onClose: () => void;
  onReset: () => Promise<void>;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <ModalActionBar
      className="style-guide-footer"
      leading={
        <StyleGuideBudgetSummary budget={model.budget} locale={model.locale} />
      }
      actions={
        <>
          {model.chapterAvailable ? (
            <Button
              variant="danger"
              onClick={() => void onReset()}
              disabled={
                !model.guide ||
                model.working ||
                jobActive ||
                !model.chapterAvailable
              }
              aria-busy={model.resetting}
            >
              {t(
                model.resetting
                  ? "styleGuide.reset.running"
                  : "styleGuide.reset.button",
              )}
            </Button>
          ) : null}
          <ModalActionButtons
            cancel={{
              label: t("common.cancel"),
              onClick: onClose,
              disabled: model.resetting,
            }}
            confirm={{
              label: t("common.save"),
              onClick: () => void model.saveGuide(),
              disabled: !model.guide || model.working,
            }}
          />
        </>
      }
    />
  );
}
