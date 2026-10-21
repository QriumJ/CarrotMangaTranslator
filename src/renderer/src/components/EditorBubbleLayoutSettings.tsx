import React from "react";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_BUBBLE_LAYOUT_PADDING_RATIO,
  MAX_BUBBLE_LAYOUT_PADDING_RATIO,
  MIN_BUBBLE_LAYOUT_PADDING_RATIO,
} from "../../../shared/bubbleLayoutSettings";
import type { PanelFormatFieldKey } from "../../../shared/panelBridgeTypes";
import type { TranslationBlock } from "../../../shared/textTypes";
import { Button } from "./ui/Button";
import { CheckboxField } from "./ui/CheckboxField";
import { NumberField } from "./ui/NumberField";
import styles from "./EditorBubbleLayoutSettings.module.css";

type Props = {
  block: TranslationBlock;
  disabled: boolean;
  mixedFields: ReadonlySet<PanelFormatFieldKey>;
  selectedBlockCount: number;
  /** Changes whenever the selected block set changes; drafts reset with it. */
  selectionKey?: string;
  onUpdate: (patch: Partial<TranslationBlock>) => void;
  /**
   * Effective padding of the selection from the page session (a block's own
   * value, else the global setting); `null` when blocks differ. Absent in
   * editors without a page session, which fall back to the block's value.
   */
  effectivePaddingRatio?: number | null;
  /** Missing where no live page image exists (block library, templates). */
  onApplyBubblePadding?: (paddingRatio: number) => void;
};

/** Bubble text padding (draft + Apply) and automatic-erase exclusion. */
export function EditorBubbleLayoutSettings(props: Props): React.JSX.Element {
  const { t } = useTranslation("components");
  const mixed = props.mixedFields.has("inpaintExcluded");
  return (
    <div className={styles.group}>
      <BubblePaddingField {...props} />
      <CheckboxField
        label={t("editor.inpainting.exclude")}
        checked={Boolean(props.block.inpaintExcluded)}
        indeterminate={mixed}
        disabled={props.disabled}
        onCheckedChange={(checked) =>
          props.onUpdate({ inpaintExcluded: mixed ? true : checked })
        }
      />
    </div>
  );
}

function BubblePaddingField({
  block,
  disabled,
  effectivePaddingRatio,
  mixedFields,
  selectedBlockCount,
  selectionKey,
  onApplyBubblePadding,
}: Props): React.JSX.Element {
  const { t } = useTranslation("components");
  const label = t("format.bubblePadding.label");
  const { mixed, stored } = resolvePaddingDisplay(
    block,
    mixedFields,
    effectivePaddingRatio,
  );
  const [draft, setDraft] = useSelectionDraft(selectionKey ?? block.id);
  const value = draft ?? (mixed ? null : stored);
  const count = Math.max(1, selectedBlockCount);
  const canApply = Boolean(onApplyBubblePadding) && !disabled && value !== null;
  return (
    <div className="editor-format-number-cell">
      <span>{label}</span>
      <div className={styles.paddingRow}>
        <NumberField
          variant="framed"
          ariaLabel={label}
          min={toPercent(MIN_BUBBLE_LAYOUT_PADDING_RATIO)}
          max={toPercent(MAX_BUBBLE_LAYOUT_PADDING_RATIO)}
          step={1}
          precision={0}
          unit="%"
          value={value ?? stored}
          mixed={draft === null && mixed}
          disabled={disabled || !onApplyBubblePadding}
          onValueChange={setDraft}
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={!canApply}
          onClick={() => {
            if (value === null || !onApplyBubblePadding) return;
            onApplyBubblePadding(value / 100);
            setDraft(null);
          }}
        >
          {count > 1
            ? t("format.bubblePadding.applyMultiple", { count })
            : t("format.bubblePadding.apply")}
        </Button>
      </div>
    </div>
  );
}

/** A draft owned by one selection: switching blocks drops it. */
function useSelectionDraft(
  key: string,
): [number | null, (value: number | null) => void] {
  const [draft, setDraftState] = React.useState<{
    key: string;
    value: number;
  } | null>(null);
  const setDraft = React.useCallback(
    (value: number | null) =>
      setDraftState(value === null ? null : { key, value }),
    [key],
  );
  return [draft?.key === key ? draft.value : null, setDraft];
}

function resolvePaddingDisplay(
  block: TranslationBlock,
  mixedFields: ReadonlySet<PanelFormatFieldKey>,
  effective: number | null | undefined,
): { mixed: boolean; stored: number } {
  const own =
    block.bubbleLayoutPaddingRatio ?? DEFAULT_BUBBLE_LAYOUT_PADDING_RATIO;
  if (effective === undefined) {
    return {
      mixed: mixedFields.has("bubbleLayoutPaddingRatio"),
      stored: toPercent(own),
    };
  }
  return { mixed: effective === null, stored: toPercent(effective ?? own) };
}

function toPercent(ratio: number): number {
  return Math.round(ratio * 100);
}
