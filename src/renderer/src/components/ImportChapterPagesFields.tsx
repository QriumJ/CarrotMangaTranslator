import React from "react";
import { useTranslation } from "react-i18next";
import type { LibraryIndex } from "../../../shared/libraryTypes";
import type { useImportModalState } from "./useImportModalState";
import { WorkSelect } from "./WorkSelect";
import { Button } from "./ui/Button";
import { Field } from "./ui/Field";
import { Select } from "./ui/Select";
import { InlineMessage } from "./ui/InlineMessage";

type ImportState = ReturnType<typeof useImportModalState>;

export function ImportChapterPagesFields({
  library,
  state,
  busy,
}: {
  library: LibraryIndex;
  state: ImportState;
  busy: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const {
    pageTarget,
    setPageTarget,
    work,
    chapter,
    loadError,
    chapterAvailable,
    retryLoad,
  } = state;
  return (
    <section className="modal-section">
      <Field label={t("import.selectWork")} as="div">
        <WorkSelect
          ariaLabel={t("import.selectWork")}
          library={library}
          value={pageTarget.workId}
          disabled={busy}
          onValueChange={(workId) => {
            const selected = library.works.find((item) => item.id === workId);
            const chapterId =
              selected?.chapterOrder.find((id) =>
                selected.chapters.some((item) => item.id === id),
              ) ??
              selected?.chapters[0]?.id ??
              "";
            setPageTarget({
              mode: "chapter",
              workId,
              chapterId,
              position: { kind: "end" },
            });
          }}
        />
      </Field>
      <Field label={t("import.selectChapter")} as="div">
        <Select
          ariaLabel={t("import.selectChapter")}
          value={pageTarget.chapterId}
          disabled={busy || !work?.chapters.length}
          options={(work?.chapters ?? []).map((item) => ({
            value: item.id,
            label: item.title,
          }))}
          onValueChange={(chapterId) =>
            setPageTarget({
              ...pageTarget,
              chapterId,
              position: { kind: "end" },
            })
          }
        />
      </Field>
      {loadError ? (
        <>
          <InlineMessage variant="danger" title={loadError} />
          <Button size="sm" onClick={retryLoad} disabled={busy}>
            {t("import.reloadChapter")}
          </Button>
        </>
      ) : chapterAvailable && !chapter ? (
        <p role="status">{t("common.loading")}</p>
      ) : null}
      {chapter ? <PageInsertionFields state={state} busy={busy} /> : null}
    </section>
  );
}

function PageInsertionFields({
  state,
  busy,
}: {
  state: ImportState;
  busy: boolean;
}) {
  const { t } = useTranslation("components");
  const { chapter, pageTarget, setPageTarget } = state;
  const { position } = pageTarget;
  const pages = chapter?.pages ?? [];
  return (
    <>
      <Field label={t("import.position")} as="div">
        <Select
          ariaLabel={t("import.position")}
          value={position.kind}
          disabled={busy}
          onValueChange={(value) =>
            setPageTarget({
              ...pageTarget,
              position:
                value === "end"
                  ? { kind: "end" }
                  : {
                      kind: value as "before" | "after",
                      pageId:
                        position.kind === "end"
                          ? (pages[0]?.id ?? "")
                          : position.pageId,
                    },
            })
          }
          options={[
            { value: "end", label: t("import.atEnd") },
            {
              value: "before",
              label: t("import.beforePage"),
              disabled: !pages.length,
            },
            {
              value: "after",
              label: t("import.afterPage"),
              disabled: !pages.length,
            },
          ]}
        />
      </Field>
      {position.kind !== "end" ? (
        <Field label={t("import.anchorPage")} as="div">
          <Select
            ariaLabel={t("import.anchorPage")}
            value={position.pageId}
            disabled={busy}
            options={pages.map((page, index) => ({
              value: page.id,
              label: `${index + 1}. ${page.name}`,
            }))}
            onValueChange={(pageId) =>
              setPageTarget({
                ...pageTarget,
                position: { ...position, pageId },
              })
            }
          />
        </Field>
      ) : null}
    </>
  );
}
