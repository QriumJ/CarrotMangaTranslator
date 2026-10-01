import React from "react";
import { useTranslation } from "react-i18next";
import type { CharacterProfile } from "../../../../shared/workContextTypes";
import { CheckboxField } from "../ui/CheckboxField";
import { getCharacterName } from "./characterContextEntryModel";
import {
  ContextEntryDelimitedInput,
  ContextEntryDraftMarker,
  ContextEntryEnabledToggle,
  ContextEntryRowActions,
  ContextEntryUsageCount,
} from "./ContextEntryList";
import type { ContextEntryTableRowProps } from "./contextEntryTableModel";
import {
  characterVoiceText,
  MAX_CHARACTER_VOICE_LENGTH,
} from "../../../../shared/workContextInstructions";
import { Input, Textarea } from "../ui/Field";

export function CharacterContextEntryRow({
  entry: character,
  draft = false,
  primaryInputRef,
  usage,
  selected,
  onToggleSelected,
  onUpdate,
  onRemove,
  onCompleteDraft,
  onCancelDraft,
  usageAvailable,
}: ContextEntryTableRowProps<CharacterProfile>): React.JSX.Element {
  const { t } = useTranslation("components");
  const name = getCharacterName(character);
  return (
    <div className={`style-guide-row character${draft ? " is-draft" : ""}`}>
      <CharacterPrimaryFields
        character={character}
        draft={draft}
        name={name}
        selected={selected}
        onToggleSelected={onToggleSelected}
        onUpdate={onUpdate}
      />
      <ContextEntryDelimitedInput
        ref={primaryInputRef}
        required={draft && !name.trim()}
        values={character.sourceNames}
        placeholder={t("styleGuide.characters.sourceNames")}
        onValuesChange={(sourceNames) => onUpdate({ sourceNames })}
      />
      <Input
        value={character.targetName}
        aria-label={t("styleGuide.characters.translatedName")}
        placeholder={t("styleGuide.characters.translatedName")}
        onChange={(event) => onUpdate({ targetName: event.target.value })}
      />
      <Textarea
        value={characterVoiceText(character)}
        aria-label={t("styleGuide.usage.speechStyleItem", { name })}
        placeholder={t("styleGuide.characters.speechStyle")}
        maxLength={MAX_CHARACTER_VOICE_LENGTH}
        rows={2}
        onChange={(event) =>
          onUpdate({
            speechStyle: "custom",
            customSpeechStyle: event.target.value,
          })
        }
      />
      <Input
        value={character.note ?? ""}
        aria-label={t("styleGuide.note")}
        placeholder={t("styleGuide.note")}
        onChange={(event) => onUpdate({ note: event.target.value })}
      />
      <ContextEntryUsageCount metric={usage} usageAvailable={usageAvailable} />
      <ContextEntryEnabledToggle
        enabled={character.enabled}
        name={name}
        onChange={(enabled) => onUpdate({ enabled })}
      />
      <ContextEntryRowActions
        draft={draft}
        name={name}
        onCompleteDraft={onCompleteDraft}
        onCancelDraft={onCancelDraft}
        onRemove={onRemove}
      />
    </div>
  );
}

function CharacterPrimaryFields({
  character,
  draft,
  name,
  selected,
  onToggleSelected,
  onUpdate,
}: {
  character: CharacterProfile;
  draft: boolean;
  name: string;
  selected: boolean;
  onToggleSelected: () => void;
  onUpdate: (patch: Partial<CharacterProfile>) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <>
      {draft ? (
        <ContextEntryDraftMarker />
      ) : (
        <CheckboxField
          className="inline-toggle"
          checked={selected}
          ariaLabel={t("styleGuide.usage.selectItem", { name })}
          onCheckedChange={onToggleSelected}
        />
      )}
      <Input
        value={character.displayName}
        aria-label={t("styleGuide.characters.displayName")}
        placeholder={t("styleGuide.characters.displayName")}
        onChange={(event) => onUpdate({ displayName: event.target.value })}
      />
    </>
  );
}
