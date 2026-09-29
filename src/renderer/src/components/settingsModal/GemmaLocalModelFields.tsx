import React from "react";
import { ControlTooltip } from "../ui/ControlTooltip";
import { useTranslation } from "react-i18next";
import type { EngineSettingsPanelProps } from "./EngineSettingsPanelTypes";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";

type LocalModelFieldsProps = Pick<
  EngineSettingsPanelProps,
  | "clearTestState"
  | "controlsBusy"
  | "localMmprojPath"
  | "localModelInputRef"
  | "localModelPath"
  | "pickLocalMmprojFile"
  | "pickLocalModelFile"
  | "setLocalMmprojPath"
  | "setLocalModelPath"
  | "submit"
>;

export function LocalModelFields(
  props: LocalModelFieldsProps,
): React.JSX.Element {
  return (
    <>
      <LocalModelFileField {...props} />
      <LocalMmprojFileField {...props} />
    </>
  );
}

function LocalModelFileField({
  clearTestState,
  controlsBusy,
  localModelInputRef,
  localModelPath,
  pickLocalModelFile,
  setLocalModelPath,
  submit,
}: LocalModelFieldsProps): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className="settings-field-stack">
      <span>{t("settings.gemma.local.modelFile")}</span>
      <div className="settings-file-row">
        <Input
          ref={localModelInputRef}
          value={localModelPath}
          disabled={controlsBusy}
          onChange={(event) => {
            clearTestState();
            setLocalModelPath(event.target.value);
          }}
          placeholder="C:\\models\\my-model.gguf"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              submit();
            }
          }}
        />
        <Button
          type="button"
          onClick={() => void pickLocalModelFile()}
          disabled={controlsBusy}
          variant="bare"
        >
          {t("settings.gemma.local.chooseFile")}
        </Button>
      </div>
    </div>
  );
}

function LocalMmprojFileField({
  clearTestState,
  controlsBusy,
  localMmprojPath,
  pickLocalMmprojFile,
  setLocalMmprojPath,
  submit,
}: LocalModelFieldsProps): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className="settings-field-stack">
      <span>{t("settings.gemma.local.mmprojFile")}</span>
      <div className="settings-file-row">
        <ControlTooltip
          floating
          content={t("settings.gemma.local.mmprojDescription")}
        >
          {(descriptionId) => (
            <Input
              aria-describedby={descriptionId}
              value={localMmprojPath}
              disabled={controlsBusy}
              onChange={(event) => {
                clearTestState();
                setLocalMmprojPath(event.target.value);
              }}
              placeholder={t("settings.gemma.local.mmprojPlaceholder")}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  submit();
                }
              }}
            />
          )}
        </ControlTooltip>
        <Button
          type="button"
          onClick={() => void pickLocalMmprojFile()}
          disabled={controlsBusy}
          variant="bare"
        >
          {t("settings.gemma.local.chooseFile")}
        </Button>
      </div>
    </div>
  );
}
