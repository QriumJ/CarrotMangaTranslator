import React from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { usePageThumbnailObserver } from "../pageThumbnails";
import { PageEditorRow } from "./PageEditorRow";
import type { PageEditorModel } from "./usePageEditor";
import styles from "./PageEditor.module.css";

export function PageEditorTable({
  model,
  disabled,
}: {
  model: PageEditorModel;
  disabled: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const viewport = React.useRef<HTMLDivElement>(null);
  const observe = usePageThumbnailObserver(viewport);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return;
        const id = String(active.id),
          target = String(over.id);
        const group = model.selected.has(id) ? model.selected : new Set([id]);
        model.move(
          {
            id: target,
            after:
              model.draft.order.indexOf(id) < model.draft.order.indexOf(target),
          },
          group,
        );
      }}
    >
      <div ref={viewport} className={styles.viewport}>
        <table className={styles.table} aria-label={t("pageEditor.title")}>
          <PageEditorTableHead />
          <tbody>
            <SortableContext items={model.draft.order}>
              {model.pages.map((page, index) => (
                <PageEditorRow
                  key={page.id}
                  page={page}
                  index={index}
                  name={model.draft.names[page.id]}
                  selected={model.selected.has(page.id)}
                  moved={model.initial.order[index] !== page.id}
                  error={model.rowErrors[page.id]}
                  observe={observe}
                  toggle={model.toggle}
                  edit={model.edit}
                  finishEdit={model.finishEdit}
                  disabled={disabled}
                />
              ))}
            </SortableContext>
          </tbody>
        </table>
      </div>
    </DndContext>
  );
}

function PageEditorTableHead(): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <>
      <colgroup>
        <col className={styles.gripColumn} />
        <col className={styles.checkColumn} />
        <col className={styles.orderColumn} />
        <col className={styles.imageColumn} />
        <col />
        <col className={styles.arrowColumn} />
        <col />
      </colgroup>
      <thead>
        <tr>
          <th aria-label={t("pageEditor.drag")} />
          <th aria-label={t("pageEditor.select")} />
          <th>{t("pageEditor.order")}</th>
          <th>{t("pageEditor.image")}</th>
          <th>{t("pageEditor.currentName")}</th>
          <th aria-hidden="true" />
          <th>{t("pageEditor.newName")}</th>
        </tr>
      </thead>
    </>
  );
}
