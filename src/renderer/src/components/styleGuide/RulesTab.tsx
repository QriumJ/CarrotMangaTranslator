import React from "react";
import { useTranslation } from "react-i18next";
import {
  MAX_WORK_INSTRUCTIONS_LENGTH,
  workInstructionsText,
} from "../../../../shared/workContextInstructions";
import type { StyleGuideEditorProps } from "./styleGuideTypes";
import { Textarea } from "../ui/Field";

export function RulesTab({
  guide,
  onGuideChange,
}: StyleGuideEditorProps): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className="style-guide-content">
      <Textarea
        className="style-guide-instructions"
        aria-label={t("styleGuide.rules.prompt")}
        placeholder={t("styleGuide.rules.promptPlaceholder")}
        rows={9}
        maxLength={MAX_WORK_INSTRUCTIONS_LENGTH}
        value={workInstructionsText(guide.rules)}
        onChange={(event) =>
          onGuideChange({
            ...guide,
            rules: { ...guide.rules, prompt: event.target.value },
          })
        }
      />
    </div>
  );
}
