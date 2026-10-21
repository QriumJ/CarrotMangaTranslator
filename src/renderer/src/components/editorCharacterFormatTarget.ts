import { TEXT_SHADOW_FIELDS } from "../../../shared/richTextShadow";
import { applyBlockCharacterFormat } from "../../../shared/richTextBlockFormatting";
import type { TextStylePatch } from "../../../shared/richTextMarkup";
import type {
  PanelFormatFieldKey,
  PanelFormatPatch,
} from "../../../shared/panelBridgeTypes";
import { resolveTextGlow } from "../../../shared/textGlow";
import type { TranslationBlock } from "../../../shared/textTypes";
import type { RichTranslationSelectionValues } from "./richTranslationEditorTypes";
import { resolveRichTranslationSelectionValues } from "./richTranslationSelectionModel";

/**
 * Where a character-format change lands. The editor controller decides it:
 * no active text edit means the whole block, a range means those letters,
 * a caret means letters typed next, and a multi-block selection means every
 * selected block.
 */
export type CharacterFormatScope = "block" | "selection" | "caret" | "blocks";

export type CharacterFormatField = keyof RichTranslationSelectionValues;

export type CharacterFormatCommands = {
  editing: boolean;
  selectAll: () => void;
  selectOutputLine?: () => void;
  finishEditing: () => void;
};

export type CharacterFormatTarget = {
  scope: CharacterFormatScope;
  blockCount: number;
  /** Code mode stores an explicit default font id instead of clearing it. */
  codeMode: boolean;
  values: RichTranslationSelectionValues;
  mixed: ReadonlySet<CharacterFormatField>;
  /** Per-letter background exists only inside one block's text runs. */
  supportsCharacterBackground: boolean;
  apply: (patch: TextStylePatch) => void;
  commands?: CharacterFormatCommands;
};

export function isBlockWideCharacterScope(
  scope: CharacterFormatScope,
): boolean {
  return scope === "block" || scope === "blocks";
}

export function resolveControllerCharacterScope(
  editingText: boolean,
  hasSelection: boolean,
): CharacterFormatScope {
  if (!editingText) return "block";
  return hasSelection ? "selection" : "caret";
}

export function resolveSelectionMixedFields(
  values: RichTranslationSelectionValues,
): ReadonlySet<CharacterFormatField> {
  const mixed = new Set(
    (values.mixedFields ?? []) as readonly CharacterFormatField[],
  );
  if (values.sizeMixed) mixed.add("sizePx");
  if (values.fontMixed) mixed.add("fontFamily");
  if (values.opacityMixed) mixed.add("opacityPercent");
  return mixed;
}

const BLOCK_FIELD_TO_CHARACTER_FIELDS: Partial<
  Record<PanelFormatFieldKey, readonly CharacterFormatField[]>
> = {
  fontFamily: ["fontFamily"],
  fontSizePx: ["sizePx"],
  bold: ["bold"],
  fontWeight: ["bold"],
  italic: ["italic"],
  underline: ["underline"],
  strikethrough: ["strikethrough"],
  emphasisMark: ["emphasisMark"],
  lineHeight: ["lineHeightPercent"],
  letterSpacing: ["letterSpacingEm"],
  fontWidthScale: ["widthPercent"],
  textColor: ["color"],
  textOpacity: ["opacityPercent"],
  outlineColor: ["outlineColor"],
  outlineWidthPx: ["outlineEnabled", "outlineWidthPx"],
  outlineWidthScale: ["outlineEnabled", "outlineWidthPx"],
  outerOutlineColor: ["outerOutlineColor"],
  outerOutlineWidthPx: ["outerOutlineEnabled", "outerOutlineWidthPx"],
  textEffect: [
    "shadowEnabled",
    "shadowColor",
    "shadowOffsetXpx",
    "shadowOffsetYpx",
    "shadowBlurPx",
    "shadowOpacityPercent",
  ],
  textGlow: ["glowEnabled", "glowColor", "glowBlurPx", "glowOpacityPercent"],
};

/** Multi-block formatting has no text controller: it edits block fields. */
export function buildBlocksCharacterFormatTarget({
  block,
  blockCount,
  mixedFields,
  onUpdate,
}: {
  block: TranslationBlock;
  blockCount: number;
  mixedFields: ReadonlySet<PanelFormatFieldKey>;
  onUpdate: (patch: Partial<TranslationBlock>) => void;
}): CharacterFormatTarget {
  const mixed = new Set<CharacterFormatField>();
  for (const field of mixedFields) {
    for (const key of BLOCK_FIELD_TO_CHARACTER_FIELDS[field] ?? []) {
      mixed.add(key);
    }
  }
  return {
    scope: "blocks",
    blockCount,
    codeMode: false,
    values: resolveRichTranslationSelectionValues(
      [],
      { start: 0, end: 0 },
      block,
      null,
      null,
    ),
    mixed,
    supportsCharacterBackground: false,
    apply: (patch) => onUpdate(characterPatchToBlockFields(block, patch)),
  };
}

/** Maps a character patch onto block fields without touching any text. */
function characterPatchToBlockFields(
  block: TranslationBlock,
  patch: TextStylePatch,
): Partial<TranslationBlock> {
  const {
    backgroundColor: _characterBackground,
    glowBlurPx,
    glowColor,
    glowOpacity,
    ...fields
  } = patch;
  const { translatedText: _text, ...mapped } = applyBlockCharacterFormat(
    { ...block, translatedText: "" },
    fields,
  );
  const textEffectFields = Object.entries(TEXT_SHADOW_FIELDS)
    .filter(
      ([key]) => patch[key as keyof typeof TEXT_SHADOW_FIELDS] !== undefined,
    )
    .map(([, field]) => field);
  const blockPatch: PanelFormatPatch = {
    ...mapped,
    ...(textEffectFields.length ? { textEffectFields } : {}),
  };
  if (
    glowBlurPx === undefined &&
    glowColor === undefined &&
    glowOpacity === undefined
  ) {
    return blockPatch;
  }
  const glow = resolveTextGlow(block.textGlow);
  return {
    ...blockPatch,
    textGlow: {
      enabled:
        glowOpacity === undefined ? glow.enabled : (glowOpacity ?? 0) > 0,
      color: glowColor ?? glow.color,
      blurPx: glowBlurPx ?? glow.blurPx,
      opacity: glowOpacity ? glowOpacity : glow.opacity,
    },
  };
}
