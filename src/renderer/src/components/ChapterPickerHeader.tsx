import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/Button";
import styles from "./ChapterPagePicker.module.css";

type ChapterPickerHeaderProps = {
  workTitle: string;
  onSelectAll: () => void;
  onClear: () => void;
} & (
  | { pageWork: true; onSelectPending?: never }
  | { pageWork?: false; onSelectPending: () => void }
);

export function ChapterPickerHeader({
  pageWork,
  workTitle,
  onSelectAll,
  onSelectPending,
  onClear,
}: ChapterPickerHeaderProps): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className={pageWork ? styles.pageWorkHeader : "translate-picker-head"}>
      <div className="translate-picker-heading">
        <div className="translate-picker-worktitle" title={workTitle}>
          {workTitle}
        </div>
        {!pageWork && (
          <div className="translate-picker-subtitle">
            {t("chapterPicker.prompt")}
          </div>
        )}
      </div>
      <div className="translate-picker-actions">
        <Button variant="ghost" size="sm" onClick={onSelectAll}>
          {t("common.selectAll")}
        </Button>
        {!pageWork && (
          <Button variant="ghost" size="sm" onClick={onSelectPending}>
            {t("chapterPicker.untranslatedOnly")}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onClear}>
          {t("common.clearAll")}
        </Button>
      </div>
    </div>
  );
}
