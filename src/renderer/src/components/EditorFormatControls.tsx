import React from "react";
import { useTranslation } from "react-i18next";
import type { TranslationBlock } from "../../../shared/textTypes";
import type { BlockFormatGroupId } from "../../../shared/blockFormat";
import type { PanelFormatFieldKey } from "../../../shared/panelBridgeTypes";
import { resolveBlockTextWordBreak } from "../../../shared/textWrapping";
import { FormatBatchApplyModal } from "./FormatBatchApplyModal";
import type { FormatApplyScope } from "../hooks/blockEditingStatus";
import { TextBackgroundField } from "./EditorColorGroup";
import { Button } from "./ui/Button";
import { CheckboxField } from "./ui/CheckboxField";
import { IconButton } from "./ui/IconButton";
import { SegmentedControl } from "./ui/SegmentedControl";
import { TextWrappingSelect } from "./TextWrappingSelect";
import { AlignCenterIcon, AlignLeftIcon, AlignRightIcon } from "./ui/icons";
import { clampFontSize, type EditorPanelModel } from "./editorPanelUtils";
import styles from "./EditorFormatControls.module.css";

type BlockPatchHandler = (patch: Partial<TranslationBlock>) => void;
type ApplyFormatHandler = (
  scope: FormatApplyScope,
  groupIds: BlockFormatGroupId[],
) => void;

type BlockSectionProps = {
  block: TranslationBlock;
  disabled: boolean;
  mixedFields: ReadonlySet<PanelFormatFieldKey>;
  onUpdate: BlockPatchHandler;
};

/**
 * Settings that always apply to the whole block (or every selected block),
 * regardless of the letters being edited in the translation.
 */
export function FormatEditorGroup({
  disableChapterApply,
  model,
  onApplyFormat,
  selectedBlockCount,
  ...props
}: BlockSectionProps & {
  disableChapterApply: boolean;
  model: EditorPanelModel;
  onApplyFormat?: ApplyFormatHandler;
  selectedBlockCount: number;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const titleId = React.useId();
  const [applyOpen, setApplyOpen] = React.useState(false);
  return (
    <section className="editor-group" aria-labelledby={titleId}>
      <div className="editor-group-head">
        <h3 id={titleId}>{t("format.blockSettings.title")}</h3>
        {onApplyFormat ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={props.disabled}
            onClick={() => setApplyOpen(true)}
            title={t("format.batchApplyTitle")}
          >
            {t("format.batchApply")}
          </Button>
        ) : null}
      </div>
      {selectedBlockCount > 1 ? (
        <p className={styles.description}>
          {t("format.blockSettings.descriptionMultiple", {
            count: selectedBlockCount,
          })}
        </p>
      ) : null}
      {applyOpen && onApplyFormat ? (
        <FormatBatchApplyModal
          selectedBlockCount={selectedBlockCount}
          disableChapterApply={disableChapterApply}
          onApply={onApplyFormat}
          onClose={() => setApplyOpen(false)}
        />
      ) : null}
      <div className="format-toolbar">
        <TextAlignButtons {...props} />
        <DirectionToggle
          disabled={props.disabled}
          mixed={props.mixedFields.has("renderDirection")}
          onUpdate={props.onUpdate}
          renderDirection={model.renderDirection}
        />
      </div>
      <div className={styles.autoFitRow}>
        <AutoFitField {...props} model={model} />
      </div>
      <TextWrappingField {...props} />
      <div className="editor-appearance-list">
        <TextBackgroundField {...props} />
      </div>
    </section>
  );
}

function AutoFitField({
  disabled,
  mixedFields,
  model,
  onUpdate,
}: BlockSectionProps & { model: EditorPanelModel }): React.JSX.Element {
  const { t } = useTranslation("components");
  const mixed = mixedFields.has("autoFitText");
  return (
    <CheckboxField
      label={t("format.autoFitTitle")}
      checked={model.autoFitText}
      indeterminate={mixed}
      disabled={disabled}
      onCheckedChange={(checked) =>
        onUpdate(
          mixed || checked
            ? { autoFitText: true, fontSizeIntent: "manual" }
            : {
                autoFitText: false,
                fontSizeIntent: "manual",
                fontSizePx: clampFontSize(model.fontSizePx),
              },
        )
      }
    />
  );
}

function TextWrappingField({
  block,
  disabled,
  mixedFields,
  onUpdate,
}: BlockSectionProps): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <label className="editor-word-break-field">
      <span>{t("format.wordBreak.label")}</span>
      <TextWrappingSelect
        ariaLabel={t("format.wordBreak.label")}
        value={resolveBlockTextWordBreak(
          block.wordBreak,
          block.renderDirection,
        )}
        disabled={disabled}
        mixed={mixedFields.has("wordBreak")}
        onChange={(wordBreak) => onUpdate({ wordBreak })}
      />
    </label>
  );
}

function TextAlignButtons({
  block,
  disabled,
  mixedFields,
  onUpdate,
}: BlockSectionProps): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className="block-style-group">
      {(
        [
          ["left", AlignLeftIcon],
          ["center", AlignCenterIcon],
          ["right", AlignRightIcon],
        ] as const
      ).map(([alignment, Icon]) => (
        <IconButton
          key={alignment}
          size="sm"
          label={t(`format.align.${alignment}`)}
          title={t(`format.align.${alignment}`)}
          aria-pressed={
            !mixedFields.has("textAlign") && block.textAlign === alignment
          }
          disabled={disabled}
          onClick={() => onUpdate({ textAlign: alignment })}
        >
          <Icon size={18} />
        </IconButton>
      ))}
    </div>
  );
}

function DirectionToggle({
  disabled,
  mixed,
  onUpdate,
  renderDirection,
}: {
  disabled: boolean;
  mixed: boolean;
  onUpdate: BlockPatchHandler;
  renderDirection: EditorPanelModel["renderDirection"];
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <SegmentedControl
      ariaLabel={t("format.directionLabel")}
      className="editor-direction-toggle"
      disabled={disabled}
      mixed={mixed}
      singleRow
      options={[
        { id: "horizontal", label: t("format.direction.horizontal") },
        { id: "vertical", label: t("format.direction.vertical") },
      ]}
      value={renderDirection}
      onChange={(nextDirection) => onUpdate({ renderDirection: nextDirection })}
    />
  );
}
