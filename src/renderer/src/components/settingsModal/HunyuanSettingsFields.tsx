import type { HunyuanSettings } from "../../../../shared/settingsTypes";
import React from "react";
import { useTranslation } from "react-i18next";
import { HUNYUAN_DEFAULTS } from "../../../../shared/hunyuanOcr";
import { SegmentedControl } from "../ui/SegmentedControl";

export function HunyuanSettingsFields({
  value = HUNYUAN_DEFAULTS,
  onChange,
  disabled,
}: {
  value?: HunyuanSettings;
  onChange: (value: HunyuanSettings) => void;
  disabled: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  return (
    <div className="settings-subsection-stack">
      <div className="settings-field-stack">
        <span>{t("settings.hardware.hunyuan.model")}</span>
        <SegmentedControl
          ariaLabel={t("settings.hardware.hunyuan.model")}
          value={value.model}
          disabled={disabled}
          options={[
            { id: "auto", label: t("settings.hardware.hunyuan.autoModel") },
            { id: "f16", label: "F16" },
            { id: "q4", label: "Q4_K_M" },
          ]}
          onChange={(model) => onChange({ ...value, model })}
        />
        <p className="muted-line modal-note">
          {t("settings.hardware.hunyuan.modelHelp")}
        </p>
      </div>
      <div className="settings-field-stack">
        <span>{t("settings.hardware.hunyuan.device")}</span>
        <SegmentedControl
          ariaLabel={t("settings.hardware.hunyuan.device")}
          value={value.device}
          disabled={disabled}
          options={[
            { id: "auto", label: t("settings.hardware.hunyuan.autoDevice") },
            { id: "gpu", label: "GPU" },
            { id: "cpu", label: "CPU" },
          ]}
          onChange={(device) => onChange({ ...value, device })}
        />
        <p className="muted-line modal-note">
          {t("settings.hardware.hunyuan.deviceHelp")}
        </p>
      </div>
    </div>
  );
}
