import type {
  RetouchLiveGeometry,
  RetouchLivePoint,
} from "./retouchLiveGeometry";

export type SampledCursorFrame = {
  /** Null until a source point exists; the cursor then asks for one. */
  sourcePoint: RetouchLivePoint | null;
  destination: RetouchLivePoint;
  geometry: RetouchLiveGeometry;
  radius: number;
  opacity: number;
  hardness: number;
  image: HTMLImageElement | null;
  drawing: boolean;
  /** Alt held, the pick button armed, or no source yet: a click sets the source. */
  picking: boolean;
};

/** `pick` shows a target cursor, `ready` previews the source under the brush. */
export type SampledCursorState = "pick" | "ready" | "paint";

const frames = new WeakMap<
  HTMLElement,
  { frame: SampledCursorFrame; id: number }
>();
const lastFrames = new WeakMap<HTMLElement, SampledCursorFrame>();

export function queueSampledCursor(
  stage: HTMLElement,
  frame: SampledCursorFrame,
): void {
  lastFrames.set(stage, frame);
  const pending = frames.get(stage);
  if (pending) {
    pending.frame = frame;
    return;
  }
  const entry = { frame, id: 0 };
  entry.id = requestAnimationFrame(() => {
    frames.delete(stage);
    render(stage, entry.frame);
  });
  frames.set(stage, entry);
}

/** Re-render the last cursor with a new pick state, e.g. when Alt toggles. */
export function refreshSampledCursor(
  stage: HTMLElement | null,
  patch: Partial<Pick<SampledCursorFrame, "picking" | "radius">>,
): void {
  if (!stage) return;
  // Before the first pointer move there is no position to draw at yet.
  const last = lastFrames.get(stage);
  if (last) queueSampledCursor(stage, { ...last, ...patch });
}

export function hideSampledCursor(stage: HTMLElement | null): void {
  if (!stage) return;
  const pending = frames.get(stage);
  if (pending) cancelAnimationFrame(pending.id);
  frames.delete(stage);
  lastFrames.delete(stage);
  const { ghost, hint, marker } = findParts(stage);
  if (marker) marker.style.visibility = "hidden";
  if (ghost) ghost.hidden = true;
  if (hint) hint.hidden = true;
}

/** Drop the pick-state attribute when the clone/heal tools are left. */
export function resetSampledCursorState(stage: HTMLElement | null): void {
  if (!stage) return;
  hideSampledCursor(stage);
  delete stage.dataset.sampledState;
}

export function resolveSampledCursorState(
  frame: Pick<SampledCursorFrame, "drawing" | "picking" | "sourcePoint">,
): SampledCursorState {
  if (frame.drawing) return "paint";
  return frame.picking || !frame.sourcePoint ? "pick" : "ready";
}

function findParts(stage: HTMLElement) {
  return {
    marker: stage.querySelector<SVGGElement>("[data-sampled-source]"),
    ghost: stage.querySelector<HTMLCanvasElement>("[data-sampled-ghost]"),
    hint: stage.querySelector<HTMLElement>("[data-sampled-hint]"),
  };
}

function render(stage: HTMLElement, frame: SampledCursorFrame): void {
  const state = resolveSampledCursorState(frame);
  stage.dataset.sampledState = state;
  const { ghost, hint, marker } = findParts(stage);
  const sx = frame.geometry.displayWidth / frame.geometry.imageWidth;
  const sy = frame.geometry.displayHeight / frame.geometry.imageHeight;
  renderMarker(marker, frame, sx, sy);
  renderHint(hint, frame, state, sx, sy);
  if (!ghost) return;
  ghost.hidden =
    state !== "ready" || !frame.sourcePoint || !frame.image?.complete;
  if (ghost.hidden || !frame.image || !frame.sourcePoint) return;
  renderGhost(ghost, frame, frame.image, frame.sourcePoint, sx, sy);
}

function renderMarker(
  marker: SVGGElement | null,
  frame: SampledCursorFrame,
  sx: number,
  sy: number,
): void {
  if (!marker) return;
  if (!frame.sourcePoint) {
    marker.style.visibility = "hidden";
    return;
  }
  marker.style.visibility = "visible";
  marker.setAttribute(
    "transform",
    `translate(${frame.sourcePoint.x * sx} ${frame.sourcePoint.y * sy})`,
  );
  const ring = marker.querySelector<SVGCircleElement>(
    "[data-sampled-source-ring]",
  );
  ring?.setAttribute("r", String(Math.max(3, frame.radius * Math.min(sx, sy))));
}

function renderHint(
  hint: HTMLElement | null,
  frame: SampledCursorFrame,
  state: SampledCursorState,
  sx: number,
  sy: number,
): void {
  if (!hint) return;
  hint.hidden = state !== "pick";
  if (hint.hidden) return;
  hint.dataset.sampledHintKind = frame.sourcePoint ? "replace" : "first";
  const offset = Math.max(3, frame.radius * Math.min(sx, sy)) * 0.72 + 10;
  hint.style.transform = `translate(${frame.destination.x * sx + offset}px, ${frame.destination.y * sy + offset}px)`;
}

function renderGhost(
  ghost: HTMLCanvasElement,
  frame: SampledCursorFrame,
  image: HTMLImageElement,
  sourcePoint: RetouchLivePoint,
  sx: number,
  sy: number,
): void {
  const size = Math.min(512, Math.ceil(frame.radius * 2));
  if (ghost.width !== size) ghost.width = ghost.height = size;
  ghost.style.width = `${frame.radius * sx * 2}px`;
  ghost.style.height = `${frame.radius * sy * 2}px`;
  ghost.style.transform = `translate(${(frame.destination.x - frame.radius) * sx}px, ${(frame.destination.y - frame.radius) * sy}px)`;
  const ctx = ghost.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(
    image,
    sourcePoint.x - frame.radius,
    sourcePoint.y - frame.radius,
    frame.radius * 2,
    frame.radius * 2,
    0,
    0,
    size,
    size,
  );
  ctx.globalCompositeOperation = "destination-in";
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    (size / 2) * Math.min(0.999, frame.hardness),
    size / 2,
    size / 2,
    size / 2,
  );
  // Alpha mask is pixel data, not UI chrome.
  gradient.addColorStop(0, `rgba(0,0,0,${frame.opacity})`);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
}
