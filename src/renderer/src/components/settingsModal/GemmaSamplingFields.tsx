import React from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_GEMMA_SAMPLING } from "../../../../shared/gemmaSamplingSettings";
import { Button } from "../ui/Button";
import { CollapsibleSection } from "../ui/Section";
import type { EngineSettingsPanelProps } from "./EngineSettingsPanelTypes";
import { SettingsNumberField } from "./SettingsNumberField";

type Props = Pick<
  EngineSettingsPanelProps,
  "gemmaSampling" | "setGemmaSampling" | "controlsBusy" | "clearTestState"
>;

const FIELDS = [
  { key: "temperature", label: "Temperature", min: 0, max: 2, step: 0.05 },
  { key: "topP", label: "Top P", min: 0.01, max: 1, step: 0.01 },
  { key: "topK", label: "Top K", min: 1, max: 500, step: 1 },
] as const;

export function GemmaSamplingFields({
  gemmaSampling,
  setGemmaSampling,
  controlsBusy,
  clearTestState,
}: Props): React.JSX.Element {
  const { t } = useTranslation("components");
  const [expanded, setExpanded] = React.useState(false);
  return (
    <CollapsibleSection
      title={t("settings.gemma.sampling.title")}
      expanded={expanded}
      onExpandedChange={setExpanded}
      divided
    >
      <div className="settings-subsection-stack">
        <p className="modal-note">{t("settings.gemma.sampling.description")}</p>
        <div className="settings-advanced-grid">
          {FIELDS.map(({ key, label, ...limits }) => (
            <SettingsNumberField
              key={key}
              ariaLabel={label}
              tooltip={t(`settings.gemma.sampling.${key}`)}
              {...limits}
              value={String(gemmaSampling[key])}
              disabled={controlsBusy}
              onValueChange={(next) => {
                clearTestState();
                setGemmaSampling((previous) => ({
                  ...previous,
                  [key]: Number(next),
                }));
              }}
            />
          ))}
        </div>
        <div>
          <Button
            variant="secondary"
            disabled={controlsBusy}
            onClick={() => {
              clearTestState();
              setGemmaSampling({ ...DEFAULT_GEMMA_SAMPLING });
            }}
          >
            {t("settings.gemma.sampling.reset")}
          </Button>
        </div>
      </div>
    </CollapsibleSection>
  );
}
