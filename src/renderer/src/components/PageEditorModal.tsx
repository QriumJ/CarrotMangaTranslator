import React from "react";
import { useTranslation } from "react-i18next";
import type { ChapterSnapshot } from "../../../shared/libraryTypes";
import type { EditPageOrganizationRequest } from "../../../shared/pageOrganization";
import { Modal } from "./ui/Modal";
import { ModalActionBar, ModalActionButtons } from "./ui/ModalActionBar";
import { Button } from "./ui/Button";
import { ConfirmModal } from "./ConfirmModal";
import {
  usePageEditor,
  type PageEditorModel,
} from "./pageEditor/usePageEditor";
import { PageEditorTable } from "./pageEditor/PageEditorTable";
import { PageEditorControls } from "./pageEditor/PageEditorControls";
import { PageEditorListBar } from "./pageEditor/PageEditorOrderTools";
import styles from "./pageEditor/PageEditor.module.css";

export type PageEditorModalProps = {
  chapter: ChapterSnapshot;
  workTitle: string;
  onSave: (request: EditPageOrganizationRequest) => Promise<void>;
  onReload: () => Promise<ChapterSnapshot>;
  onClose: () => void;
};

export function PageEditorModal(
  props: PageEditorModalProps,
): React.JSX.Element {
  const { t } = useTranslation("components");
  const [chapter, setChapter] = React.useState(props.chapter);
  const [revision, setRevision] = React.useState(0);
  return (
    <PageEditorContent
      key={revision}
      {...props}
      chapter={chapter}
      reload={async () => {
        const next = await props.onReload();
        setChapter(next);
        setRevision((v) => v + 1);
      }}
      title={`${t("pageEditor.title")} · ${chapter.title}`}
    />
  );
}

function PageEditorContent({
  chapter,
  workTitle,
  onSave,
  onClose,
  reload,
  title,
}: PageEditorModalProps & {
  reload: () => Promise<void>;
  title: string;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const model = usePageEditor(chapter, workTitle);
  const session = useEditorSession(model, onSave, onClose, reload);
  const { disabled, close, save, failure, confirm, setConfirm, discard } =
    session;
  return (
    <>
      <Modal
        title={title}
        size="xl"
        maxHeight="900px"
        fillHeight
        bodyLayout="bare"
        closeDisabled={disabled}
        onClose={close}
        footer={
          <EditorFooter
            model={model}
            disabled={disabled}
            close={close}
            save={save}
          />
        }
      >
        <div className={styles.layout}>
          <PageEditorControls model={model} disabled={disabled} />
          <div className={styles.main}>
            <PageEditorListBar model={model} disabled={disabled} />
            <EditorAlerts
              model={model}
              failure={failure}
              disabled={disabled}
              onReload={() => setConfirm("reload")}
            />
            <PageEditorTable model={model} disabled={disabled} />
          </div>
        </div>
      </Modal>
      {confirm ? (
        <ConfirmModal
          title={t("pageEditor.discardTitle")}
          message={t("pageEditor.discard")}
          onCancel={() => setConfirm(null)}
          onConfirm={discard}
        />
      ) : null}
    </>
  );
}

function EditorAlerts({
  model,
  failure,
  disabled,
  onReload,
}: {
  model: PageEditorModel;
  failure: string;
  disabled: boolean;
  onReload: () => void;
}): React.JSX.Element | null {
  const { t } = useTranslation("components");
  if (!model.error && !failure) return null;
  return (
    <div className={styles.alerts}>
      {model.error ? (
        <p role="alert" className={styles.error}>
          {t(`pageEditor.errors.${model.error}`, {
            defaultValue: t("pageEditor.errors.rename"),
          })}
        </p>
      ) : null}
      {failure ? (
        <div role="alert" className={styles.error}>
          {failure}
          <Button size="sm" disabled={disabled} onClick={onReload}>
            {t("pageEditor.reload")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function useEditorSession(
  model: PageEditorModel,
  onSave: PageEditorModalProps["onSave"],
  onClose: () => void,
  reload: () => Promise<void>,
) {
  const { t } = useTranslation("components");
  const [busy, setBusy] = React.useState(false);
  const [failure, setFailure] = React.useState("");
  const [confirm, setConfirm] = React.useState<"close" | "reload" | null>(null);
  const save = async () => {
    setBusy(true);
    setFailure("");
    try {
      await onSave(model.request());
      onClose();
    } catch (error) {
      setFailure(
        error instanceof Error ? error.message : t("pageEditor.errors.save"),
      );
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    if (busy || model.working) return;
    if (model.changed) setConfirm("close");
    else onClose();
  };
  const disabled = busy || model.working;

  const discard = () => {
    if (confirm === "close") {
      onClose();
      return;
    }
    setConfirm(null);
    setBusy(true);
    void reload().catch((error: unknown) => {
      setFailure(
        error instanceof Error ? error.message : t("pageEditor.errors.save"),
      );
      setBusy(false);
    });
  };
  return { disabled, close, save, failure, confirm, setConfirm, discard };
}
function EditorFooter({
  model,
  disabled,
  close,
  save,
}: {
  model: PageEditorModel;
  disabled: boolean;
  close: () => void;
  save: () => Promise<void>;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <ModalActionBar
      leading={t("pageEditor.changes", {
        names: model.nameChanges,
        order: model.orderChanges,
      })}
      actions={
        <ModalActionButtons
          cancel={{ label: t("common.cancel"), onClick: close, disabled }}
          confirm={{
            label: t("common.save"),
            onClick: () => void save(),
            disabled:
              disabled ||
              !model.changed ||
              Boolean(Object.keys(model.rowErrors).length),
          }}
        />
      }
    />
  );
}
