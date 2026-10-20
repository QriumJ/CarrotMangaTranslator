import React from "react";
import {
  SampledRetouchSliders,
  SampledRetouchSourceControls,
} from "./SampledRetouchSettings";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { RetouchTool } from "../../lib/stageTool";
import { ColorField } from "../ColorField";
import { Button } from "../ui/Button";
import { ColorPaletteSwatches } from "../ui/ColorPaletteSwatches";
import { RangeInput } from "../ui/Field";
import { useWorkspacePreference } from "../../hooks/useWorkspacePreference";
import {
  MASK_ADJUSTMENT_RADIUS_RANGE,
  RETOUCH_BRUSH_RADIUS_RANGE,
} from "../../lib/workspacePreferences";

type RetouchInpaintingStepProps = {
  aiUnavailable?: boolean;
  codexErasureAvailable?: boolean;
  codexErasureBusy?: boolean;
  activeToolLabel: string;
  brushColor: string;
  brushRadius: number;
  colorTool: boolean;
  hasSelectedPage: boolean;
  jobActive: boolean;
  maskStrokeCount: number;
  onBrushColorChange: (value: string) => void;
  onBrushRadiusChange: (value: number) => void;
  onAdjustPatternMask: (deltaPx: number) => void;
  onClearPatternMask: () => void;
  onRunDrawnPattern: (engine?: "codex") => void;
  sizableTool: boolean;
  tool: RetouchTool;
};

export function RetouchInpaintingStep(
  props: RetouchInpaintingStepProps,
): React.JSX.Element {
  const maskActive = props.tool === "mask" || props.maskStrokeCount > 0;

  return (
    <div className="inpaint-step-body">
      <RetouchToolsBar {...props} />

      {maskActive ? <DrawnMaskActionGroup {...props} /> : null}
    </div>
  );
}

function RetouchToolsBar(props: RetouchInpaintingStepProps): React.JSX.Element {
  return (
    <div className="retouch-tools-bar">
      <RetouchToolsHeader {...props} />
      {props.sizableTool || props.colorTool ? (
        <RetouchToolSettings {...props} />
      ) : null}
    </div>
  );
}

function RetouchToolsHeader({
  activeToolLabel,
}: RetouchInpaintingStepProps): React.JSX.Element {
  return (
    <div className="retouch-tools-bar-head">
      <span className="retouch-active-tool">{activeToolLabel}</span>
    </div>
  );
}

function RetouchToolSettings({
  activeToolLabel,
  brushColor,
  brushRadius,
  colorTool,
  onBrushColorChange,
  onBrushRadiusChange,
  tool,
}: RetouchInpaintingStepProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const sampledTool = tool === "clone" || tool === "heal" ? tool : null;
  const sizeControl =
    tool === "brush" || tool === "eraser" || tool === "mask" || sampledTool ? (
      <label className="brush-size-control">
        <span className="brush-size-label">{t("format.size")}</span>
        <RangeInput
          min={RETOUCH_BRUSH_RADIUS_RANGE.min}
          max={RETOUCH_BRUSH_RADIUS_RANGE.max}
          value={brushRadius}
          disabled={false}
          onChange={(event) => onBrushRadiusChange(Number(event.target.value))}
        />
        <strong>{brushRadius}px</strong>
      </label>
    ) : null;
  return (
    <div className="retouch-tool-settings">
      {sampledTool ? (
        <>
          <div className="retouch-slider-stack">
            {sizeControl}
            <SampledRetouchSliders tool={sampledTool} />
          </div>
          <SampledRetouchSourceControls />
        </>
      ) : (
        sizeControl
      )}
      {colorTool ? (
        <RetouchColorControl
          activeToolLabel={activeToolLabel}
          brushColor={brushColor}
          disabled={false}
          onBrushColorChange={onBrushColorChange}
        />
      ) : null}
    </div>
  );
}

function RetouchColorControl({
  activeToolLabel,
  brushColor,
  disabled,
  onBrushColorChange,
}: Pick<
  RetouchInpaintingStepProps,
  "activeToolLabel" | "brushColor" | "onBrushColorChange"
> & {
  disabled: boolean;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const accessibleLabel = `${activeToolLabel} ${t("format.color")}`;

  return (
    <div className="retouch-color-control">
      <span className="retouch-color-label">{t("format.color")}</span>
      <ColorField
        label={accessibleLabel}
        labelHidden
        value={brushColor}
        disabled={disabled}
        onChange={onBrushColorChange}
      />
      <ColorPaletteSwatches
        value={brushColor}
        disabled={disabled}
        onSelect={onBrushColorChange}
      />
    </div>
  );
}

function DrawnMaskActionGroup({
  aiUnavailable,
  codexErasureAvailable,
  codexErasureBusy,
  hasSelectedPage,
  jobActive,
  maskStrokeCount,
  onAdjustPatternMask,
  onClearPatternMask,
  onRunDrawnPattern,
}: RetouchInpaintingStepProps): React.JSX.Element {
  const { t } = useTranslation("components");
  const noMask = !hasSelectedPage || maskStrokeCount === 0;
  const disabled = jobActive || noMask;
  const codexDisabled = (codexErasureBusy ?? jobActive) || noMask;
  return (
    <div className="inpaint-group">
      <div className="inpaint-group-head">
        <h3>{t("inpainting.retouch.eraseDrawn")}</h3>
        <small>{resolveMaskStrokeLabel(maskStrokeCount, t)}</small>
      </div>
      <MaskAdjustRow
        disabled={maskStrokeCount === 0}
        onAdjustPatternMask={onAdjustPatternMask}
      />
      <div className="mask-action-row">
        <Button
          size="sm"
          disabled={maskStrokeCount === 0}
          onClick={onClearPatternMask}
        >
          {t("common.clear")}
        </Button>
        <Button
          variant="primary"
          fullWidth
          disabled={aiUnavailable || disabled}
          onClick={() => onRunDrawnPattern()}
        >
          {t("inpainting.retouch.eraseDrawnArea")}
        </Button>
      </div>
      <CodexMaskButton
        available={codexErasureAvailable}
        disabled={codexDisabled}
        onRun={onRunDrawnPattern}
      />
    </div>
  );
}

/** The grow/shrink step is a remembered tool setting, saved on release. */
function MaskAdjustRow({
  disabled,
  onAdjustPatternMask,
}: {
  disabled: boolean;
  onAdjustPatternMask: (deltaPx: number) => void;
}): React.JSX.Element {
  const { t } = useTranslation("components");
  const [adjustmentRadius, setAdjustmentRadius, commitAdjustmentRadius] =
    useWorkspacePreference("maskAdjustmentRadius", { commitDelayMs: 250 });
  return (
    <div className="mask-adjust-row">
      <label className="brush-size-control">
        <span className="brush-size-label">
          {t("inpainting.retouch.maskRadius")}
        </span>
        <RangeInput
          min={MASK_ADJUSTMENT_RADIUS_RANGE.min}
          max={MASK_ADJUSTMENT_RADIUS_RANGE.max}
          value={adjustmentRadius}
          disabled={disabled}
          onChange={(event) => setAdjustmentRadius(Number(event.target.value))}
          onPointerUp={commitAdjustmentRadius}
          onKeyUp={commitAdjustmentRadius}
          onBlur={commitAdjustmentRadius}
        />
        <strong>{adjustmentRadius}px</strong>
      </label>
      <div className="mask-adjust-buttons">
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => onAdjustPatternMask(-adjustmentRadius)}
        >
          {t("inpainting.retouch.shrinkMask")}
        </Button>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => onAdjustPatternMask(adjustmentRadius)}
        >
          {t("inpainting.retouch.expandMask")}
        </Button>
      </div>
    </div>
  );
}

function resolveMaskStrokeLabel(
  maskStrokeCount: number,
  t: TFunction<"components">,
): string {
  return maskStrokeCount > 0
    ? t("inpainting.retouch.drawnAreas", { count: maskStrokeCount })
    : t("inpainting.retouch.soundEffectTouchup");
}

function CodexMaskButton({
  available,
  disabled,
  onRun,
}: {
  available?: boolean;
  disabled: boolean;
  onRun: RetouchInpaintingStepProps["onRunDrawnPattern"];
}) {
  const { t } = useTranslation("components");
  return (
    <Button
      fullWidth
      disabled={!available || disabled}
      onClick={() => onRun("codex")}
    >
      {t("inpainting.retouch.eraseWithCodex")}
    </Button>
  );
}
