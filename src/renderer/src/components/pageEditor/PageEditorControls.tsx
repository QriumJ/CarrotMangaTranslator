import React from "react";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "../ui/SegmentedControl";
import { PageEditorOrderTools } from "./PageEditorOrderTools";
import { PageEditorRenameTools } from "./PageEditorRenameTools";
import type { PageEditorModel } from "./usePageEditor";
import styles from "./PageEditor.module.css";

type Mode = "order" | "name";
type Props = { model: PageEditorModel; disabled: boolean };

/** The left pane: what to change, which pages it applies to, and how. */
export function PageEditorControls({
  model,
  disabled,
}: Props): React.JSX.Element {
  const { t } = useTranslation("components");
  const [mode, setMode] = React.useState<Mode>("order");
  return (
    <aside className={styles.sidebar}>
      <SegmentedControl
        ariaLabel={t("pageEditor.mode")}
        disabled={disabled}
        value={mode}
        onChange={setMode}
        options={[
          { id: "order", label: t("pageEditor.reorder") },
          { id: "name", label: t("pageEditor.rename") },
        ]}
      />
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t("pageEditor.scope")}</h3>
        <SegmentedControl
          ariaLabel={t("pageEditor.scope")}
          disabled={disabled}
          value={model.scope}
          onChange={model.setScope}
          options={[
            { id: "all", label: t("pageEditor.allPages") },
            { id: "selected", label: t("pageEditor.selectedPages") },
          ]}
        />
      </section>
      <fieldset disabled={disabled}>
        {mode === "order" ? (
          <PageEditorOrderTools model={model} />
        ) : (
          <PageEditorRenameTools model={model} />
        )}
      </fieldset>
    </aside>
  );
}
