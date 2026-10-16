import React from "react";
import { useTranslation } from "react-i18next";
import { useSampledRetouch } from "../../inpainting/sampledRetouchModel";
import { RangeInput } from "../ui/Field";
import { CheckboxField } from "../ui/CheckboxField";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Button } from "../ui/Button";

type SampledTool = "clone" | "heal";

/** Hardness and opacity rows; they share the size row's columns. */
export function SampledRetouchSliders({ tool }: { tool: SampledTool }) {
  const model = useSampledRetouch();
  const { t } = useTranslation("components");
  if (!model) return null;
  const hardness = tool === "clone" ? model.cloneHardness : model.healHardness;
  const setHardness =
    tool === "clone" ? model.setCloneHardness : model.setHealHardness;
  return (
    <>
      <label className="brush-size-control">
        <span className="brush-size-label">
          {t("inpainting.stamp.hardness")}
        </span>
        <RangeInput
          min={0}
          max={100}
          value={hardness}
          disabled={model.busy}
          onChange={(event) => setHardness(Number(event.target.value))}
        />
        <strong>{hardness}%</strong>
      </label>
      <label className="brush-size-control">
        <span className="brush-size-label">
          {t("inpainting.stamp.opacity")}
        </span>
        <RangeInput
          min={1}
          max={100}
          value={model.opacity}
          disabled={model.busy}
          onChange={(event) => model.setOpacity(Number(event.target.value))}
        />
        <strong>{model.opacity}%</strong>
      </label>
    </>
  );
}

/** Where pixels are copied from, and whether that point is set yet. */
export function SampledRetouchSourceControls() {
  const model = useSampledRetouch();
  const { t } = useTranslation("components");
  if (!model) return null;
  const sourceState = model.sampling
    ? "picking"
    : model.hasAnchor
      ? "set"
      : "unset";
  return (
    <div className="retouch-sample-options">
      <SegmentedControl
        ariaLabel={t("inpainting.stamp.source")}
        disabled={model.busy}
        value={model.source}
        options={[
          {
            id: "current",
            label: t("inpainting.stamp.current"),
            tooltip: t("inpainting.stamp.currentTooltip"),
          },
          {
            id: "original",
            label: t("inpainting.stamp.original"),
            tooltip: t("inpainting.stamp.originalTooltip"),
          },
        ]}
        onChange={(value) => {
          model.setSource(value);
          model.anchor.current = null;
          model.offset.current = null;
          model.setHasAnchor(false);
        }}
      />
      <CheckboxField
        label={t("inpainting.stamp.aligned")}
        title={t("inpainting.stamp.alignedTooltip")}
        checked={model.aligned}
        disabled={model.busy}
        onCheckedChange={(checked) => {
          model.setAligned(checked);
          model.offset.current = null;
        }}
      />
      <div className="retouch-sample-source" data-source-state={sourceState}>
        <span className="retouch-sample-source-status" role="status">
          <i aria-hidden="true" />
          {t(
            model.busy
              ? "inpainting.stamp.processing"
              : `inpainting.stamp.sourceState.${sourceState}`,
          )}
        </span>
        <Button
          size="sm"
          disabled={model.busy}
          aria-pressed={model.sampling}
          onClick={() => model.setSampling(!model.sampling)}
        >
          {t(
            model.hasAnchor
              ? "inpainting.stamp.repick"
              : "inpainting.stamp.pick",
          )}
        </Button>
      </div>
      <p className="retouch-tool-hint">{t("inpainting.stamp.keys")}</p>
    </div>
  );
}
