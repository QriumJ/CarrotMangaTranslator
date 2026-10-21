import type { TextStylePatch } from "../../../shared/richTextMarkup";
import type { TranslationBlock } from "../../../shared/textTypes";
import {
  BlockSpacingFields,
  type BlockSpacingValues,
} from "./BlockSpacingFields";
import { BlockTextOpacityField } from "./BlockTextOpacityField";
import {
  isBlockWideCharacterScope,
  type CharacterFormatTarget,
} from "./editorCharacterFormatTarget";
import { EditorColorGroup } from "./EditorColorGroup";
import { EditorFontSizeRow } from "./EditorFontSizeRow";
import { resolveEditorPanelModel } from "./editorPanelUtils";
import styles from "./EditorCharacterFormatSection.module.css";

/**
 * Two-column character grid in task order: size and leading, tracking and
 * width, then color and opacity. It stays two columns in a 300px rail.
 */
export function EditorCharacterNumberFields({
  block,
  disabled,
  resolvedFontSizePx,
  target,
  onAdjustFontSize,
}: {
  block: TranslationBlock;
  disabled: boolean;
  resolvedFontSizePx: number | null;
  target: CharacterFormatTarget;
  onAdjustFontSize: (adjustment: -1 | 1) => void;
}): React.JSX.Element {
  const { apply, mixed, values } = target;
  const blockWide = isBlockWideCharacterScope(target.scope);
  return (
    <div className={styles.typeGrid}>
      <EditorFontSizeRow
        disabled={disabled}
        fontSizeMixed={mixed.has("sizePx")}
        fontSizePx={
          blockWide && !mixed.has("sizePx")
            ? resolveEditorPanelModel(block, resolvedFontSizePx).fontSizePx
            : values.sizePx
        }
        onAdjust={blockWide ? onAdjustFontSize : undefined}
        onChange={(sizePx) => apply({ sizePx })}
      />
      <BlockSpacingFields
        disabled={disabled}
        mixed={{
          lineHeight: mixed.has("lineHeightPercent"),
          letterSpacingEm: mixed.has("letterSpacingEm"),
          fontWidthScale: mixed.has("widthPercent"),
        }}
        values={{
          lineHeight:
            (values.lineHeightPercent ?? block.lineHeight * 100) / 100,
          letterSpacingEm: values.letterSpacingEm ?? 0,
          fontWidthScale: values.widthPercent / 100,
        }}
        onChange={(patch) => apply(spacingStylePatch(patch))}
      />
      <EditorColorGroup disabled={disabled} target={target} />
      <BlockTextOpacityField
        disabled={disabled}
        mixed={mixed.has("opacityPercent")}
        opacity={values.opacityPercent / 100}
        onChange={(opacity) => apply({ opacity })}
      />
    </div>
  );
}

/** One edited spacing field becomes exactly one style key; absent keys stay. */
function spacingStylePatch(patch: Partial<BlockSpacingValues>): TextStylePatch {
  if (patch.lineHeight !== undefined) return { lineHeight: patch.lineHeight };
  if (patch.letterSpacingEm !== undefined) {
    return { letterSpacing: patch.letterSpacingEm };
  }
  return { widthScale: patch.fontWidthScale };
}
