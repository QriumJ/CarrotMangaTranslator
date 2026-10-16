import { createPageRevision } from "../../../shared/pageRevision";
import { useSampledRetouch } from "../inpainting/sampledRetouchModel";
import { clearRetouchLiveOverlay } from "../lib/retouchLiveOverlay";
import type { UseWorkspaceInpaintingPointerHandlersOptions } from "./workspaceInpaintingPointerTypes";
import type { ResolvedImagePoint } from "./useWorkspaceImagePointResolver";
import type { RetouchPoint } from "./inpaintingRetouchTypes";

type SampledGestureOptions = Pick<
  UseWorkspaceInpaintingPointerHandlersOptions,
  | "selectedPage"
  | "inpaintingTool"
  | "inpaintingBrushRadius"
  | "imageRef"
  | "stageRef"
  | "pushStatus"
  | "applyRetouchOperation"
>;

type Model = NonNullable<ReturnType<typeof useSampledRetouch>>;

export function beginSampledGesture(
  model: Model,
  options: SampledGestureOptions,
  resolved: ResolvedImagePoint,
  pick: boolean,
): boolean {
  if (model.busy || model.pending.current || !options.selectedPage)
    return false;
  // Without a source the first click defines one instead of doing nothing.
  if (pick || model.sampling || !model.anchor.current) {
    model.anchor.current = {
      x: Math.round(resolved.point.x),
      y: Math.round(resolved.point.y),
    };
    model.offset.current = null;
    model.setSampling(false);
    model.setHasAnchor(true);
    return false;
  }
  if (!model.aligned || !model.offset.current)
    model.offset.current = {
      x: model.anchor.current.x - Math.round(resolved.point.x),
      y: model.anchor.current.y - Math.round(resolved.point.y),
    };
  model.stroke.current = {
    mode: options.inpaintingTool === "heal" ? "heal" : "clone",
    geometry: {
      kind: "stroke",
      points: [],
      radiusPx: options.inpaintingBrushRadius,
    },
    expectedRevision: createPageRevision(options.selectedPage),
    requestId: crypto.randomUUID(),
    sampled: {
      source: model.source,
      offset: { ...model.offset.current },
      opacity: model.opacity / 100,
      hardness:
        (options.inpaintingTool === "heal"
          ? model.healHardness
          : model.cloneHardness) / 100,
    },
  };
  return true;
}

export async function finishSampledGesture(
  model: Model,
  options: SampledGestureOptions,
  points: RetouchPoint[],
): Promise<void> {
  const stroke = model.stroke.current;
  model.stroke.current = null;
  if (
    !stroke ||
    !stroke.requestId ||
    stroke.geometry.kind !== "stroke" ||
    !points.length
  )
    return;
  model.pending.current = stroke.requestId;
  model.setBusy(true);
  const preview = awaitSampledImage(model, options);
  try {
    await options.applyRetouchOperation({
      ...stroke,
      geometry: { ...stroke.geometry, points },
      onSettled: (path) => {
        preview.changed = path !== null;
        model.committedPath.current = path;
      },
    });
    preview.settled();
  } catch (error) {
    preview.clear();
    options.pushStatus(error instanceof Error ? error.message : String(error));
  } finally {
    model.pending.current = null;
  }
}

function awaitSampledImage(model: Model, options: SampledGestureOptions) {
  const image = options.imageRef.current;
  const stage = options.stageRef.current;
  const beforeSource = image?.src;
  const preview = { changed: false, clear, settled };
  function clear() {
    clearRetouchLiveOverlay(stage);
    image?.removeEventListener("load", loaded);
    image?.removeEventListener("error", clear);
    model.previewCleanup.current = null;
    model.setBusy(false);
  }
  function loaded() {
    if (preview.changed && image?.src !== beforeSource) clear();
  }
  function settled() {
    if (
      !preview.changed ||
      !image ||
      (image.complete && image.src !== beforeSource)
    )
      clear();
  }
  model.previewCleanup.current?.();
  model.previewCleanup.current = clear;
  image?.addEventListener("load", loaded);
  image?.addEventListener("error", clear);
  return preview;
}
