import { useCallback, type PointerEvent } from "react";
import { useSampledRetouch } from "../inpainting/sampledRetouchModel";
import { queueSampledCursor } from "../lib/sampledRetouchCursor";
import type {
  ImagePointResolver,
  ResolvedImagePoint,
} from "./useWorkspaceImagePointResolver";
import type { UseWorkspaceInpaintingPointerHandlersOptions } from "./workspaceInpaintingPointerTypes";

type Model = NonNullable<ReturnType<typeof useSampledRetouch>>;
type CursorOptions = Pick<
  UseWorkspaceInpaintingPointerHandlersOptions,
  | "inpaintingTool"
  | "inpaintingBrushRadius"
  | "imageRef"
  | "stageRef"
  | "inpaintingRetouchDrawingRef"
>;

export function useSampledRetouchCursor(
  options: UseWorkspaceInpaintingPointerHandlersOptions,
  imagePointResolver: ImagePointResolver,
  move: (event: PointerEvent) => boolean,
) {
  const sampled = useSampledRetouch();
  return useCallback(
    (event: PointerEvent) => {
      if (
        sampled &&
        (options.inpaintingTool === "clone" ||
          options.inpaintingTool === "heal")
      ) {
        const resolved = imagePointResolver.resolve(event);
        if (resolved) {
          // The pointer is the source of truth; a missed keyup cannot stick.
          sampled.altHeld.current = event.altKey;
          queueSampledCursorAt(sampled, options, resolved);
        }
      }
      return move(event);
    },
    [sampled, options, imagePointResolver, move],
  );
}

/** Draw the clone/heal cursor for a resolved pointer position. */
export function queueSampledCursorAt(
  model: Model,
  options: CursorOptions,
  resolved: ResolvedImagePoint,
): void {
  const stage = options.stageRef.current;
  if (!stage) return;
  const drawing = Boolean(
    options.inpaintingRetouchDrawingRef.current || model.pending.current,
  );
  queueSampledCursor(stage, {
    sourcePoint: model.anchor.current
      ? resolveSourcePoint(model, resolved.point, drawing)
      : null,
    destination: resolved.point,
    geometry: resolved.geometry,
    radius: options.inpaintingBrushRadius,
    opacity: model.opacity / 100,
    hardness:
      (options.inpaintingTool === "clone"
        ? model.cloneHardness
        : model.healHardness) / 100,
    image:
      model.source === "original"
        ? stage.querySelector<HTMLImageElement>(
            "[data-retouch-original-source]",
          )
        : options.imageRef.current,
    drawing,
    picking: !drawing && (model.altHeld.current || model.sampling),
  });
}

function resolveSourcePoint(
  model: Model,
  destination: { x: number; y: number },
  drawing: boolean,
) {
  const offset = model.offset.current;
  if (offset && (model.aligned || drawing))
    return { x: destination.x + offset.x, y: destination.y + offset.y };
  return model.anchor.current ?? destination;
}
