import React from "react";
import { useTranslation } from "react-i18next";
import {
  IconArrowBackUp,
  IconArrowBarToDown,
  IconArrowBarToUp,
  IconArrowDown,
  IconArrowForwardUp,
  IconArrowUp,
  IconArrowsDownUp,
  IconSortAscendingLetters,
  IconSortDescendingLetters,
} from "@tabler/icons-react";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Input } from "../ui/Field";
import { Select } from "../ui/Select";
import { SegmentedControl } from "../ui/SegmentedControl";
import type { PageEditorModel } from "./usePageEditor";
import styles from "./PageEditor.module.css";

type ModelProps = { model: PageEditorModel };

/** Above the list: what is selected, how to select more, and history. */
export function PageEditorListBar({
  model,
  disabled,
}: ModelProps & { disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className={styles.listBar}>
      <span className={styles.selectionCount}>
        {t("pageEditor.selected", {
          count: model.selected.size,
          total: model.pages.length,
        })}
      </span>
      <SelectionActions model={model} disabled={disabled} />
      <RangeSelection model={model} disabled={disabled} />
      <div className={styles.history}>
        <IconButton
          size="sm"
          label={t("pageEditor.undo")}
          title={t("pageEditor.undo")}
          disabled={disabled || !model.canUndo}
          onClick={model.undo}
        >
          <IconArrowBackUp size={16} aria-hidden="true" />
        </IconButton>
        <IconButton
          size="sm"
          label={t("pageEditor.redo")}
          title={t("pageEditor.redo")}
          disabled={disabled || !model.canRedo}
          onClick={model.redo}
        >
          <IconArrowForwardUp size={16} aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}

function SelectionActions({
  model,
  disabled,
}: ModelProps & { disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation("components");
  const invert = () =>
    model.select(
      new Set(model.draft.order.filter((id) => !model.selected.has(id))),
    );
  return (
    <div className={styles.selectionActions}>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={() => model.select(new Set(model.draft.order))}
      >
        {t("pageEditor.all")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={() => model.select(new Set())}
      >
        {t("pageEditor.none")}
      </Button>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={invert}>
        {t("pageEditor.invert")}
      </Button>
    </div>
  );
}

function RangeSelection({
  model,
  disabled,
}: ModelProps & { disabled: boolean }): React.JSX.Element {
  const { t } = useTranslation("components");
  const [range, setRange] = React.useState("");
  return (
    <div className={styles.rangeGroup}>
      <Input
        aria-label={t("pageEditor.range")}
        placeholder="1-5, 8, 12-15"
        value={range}
        disabled={disabled}
        onChange={(e) => setRange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") model.range(range);
        }}
      />
      <Button size="sm" disabled={disabled} onClick={() => model.range(range)}>
        {t("pageEditor.selectRange")}
      </Button>
    </div>
  );
}

const MOVES = [
  { direction: "up", Icon: IconArrowUp },
  { direction: "down", Icon: IconArrowDown },
  { direction: "first", Icon: IconArrowBarToUp },
  { direction: "last", Icon: IconArrowBarToDown },
] as const;

/** Moving the checked pages, then sorting the pages in the current scope. */
export function PageEditorOrderTools({ model }: ModelProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const none = !model.selected.size;
  return (
    <>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("pageEditor.moveSection")}</h3>
        <div className={styles.buttonGrid}>
          {MOVES.map(({ direction, Icon }) => (
            <Button
              size="sm"
              key={direction}
              disabled={none}
              iconLeft={<Icon size={16} aria-hidden="true" />}
              onClick={() => model.move(direction)}
            >
              {t(`pageEditor.${direction}`)}
            </Button>
          ))}
        </div>
        <TargetMove model={model} />
      </section>
      <SortTools model={model} />
    </>
  );
}

function TargetMove({ model }: ModelProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const [target, setTarget] = React.useState(model.draft.order[0] ?? "");
  const blocked = !model.selected.size || model.selected.has(target);
  return (
    <>
      <Select
        ariaLabel={t("pageEditor.target")}
        value={target}
        onValueChange={setTarget}
        options={model.pages.map((p, index) => ({
          value: p.id,
          label: `${index + 1} · ${p.name}`,
        }))}
      />
      <div className={styles.buttonGrid}>
        <Button
          size="sm"
          disabled={blocked}
          onClick={() => model.move({ id: target, after: false })}
        >
          {t("pageEditor.before")}
        </Button>
        <Button
          size="sm"
          disabled={blocked}
          onClick={() => model.move({ id: target, after: true })}
        >
          {t("pageEditor.after")}
        </Button>
      </div>
    </>
  );
}

const SORTS = [
  { mode: "asc", Icon: IconSortAscendingLetters },
  { mode: "desc", Icon: IconSortDescendingLetters },
  { mode: "reverse", Icon: IconArrowsDownUp },
] as const;

function SortTools({ model }: ModelProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const [basis, setBasis] = React.useState<"old" | "new">("old");
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{t("pageEditor.sortSection")}</h3>
      <SegmentedControl
        ariaLabel={t("pageEditor.sortBy")}
        value={basis}
        onChange={setBasis}
        options={[
          { id: "old", label: t("pageEditor.currentName") },
          { id: "new", label: t("pageEditor.newName") },
        ]}
      />
      <div className={styles.stack}>
        {SORTS.map(({ mode, Icon }) => (
          <Button
            size="sm"
            key={mode}
            disabled={!model.targets.size}
            iconLeft={<Icon size={16} aria-hidden="true" />}
            onClick={() => model.sort(mode, basis === "old")}
          >
            {t(`pageEditor.${mode}`)}
          </Button>
        ))}
      </div>
    </section>
  );
}
