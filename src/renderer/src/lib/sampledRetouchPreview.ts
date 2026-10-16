import {
  RetouchCoverageBuilder,
  RETOUCH_TILE_SIZE,
  type CoverageTile,
} from "../../../shared/sampledRetouch";
import type { SampledRetouchSettings } from "../../../shared/sampledRetouch";
import type {
  RetouchLiveGeometry,
  RetouchLivePoint,
} from "./retouchLiveGeometry";

type Preview = {
  builder: RetouchCoverageBuilder;
  scratch: HTMLCanvasElement;
  mask: HTMLCanvasElement;
  alpha: ImageData;
  tiles: Set<CoverageTile>;
  rendered: Set<CoverageTile>;
  points: RetouchLivePoint[];
  steps: Generator<void> | null;
  finishRequested: boolean;
};
const previews = new WeakMap<HTMLElement, Preview>();

export function resetSampledPreview(stage: HTMLElement): void {
  previews.delete(stage);
}

function createPreview(
  geometry: RetouchLiveGeometry,
  radius: number,
  hardness: number,
): Preview {
  const scratch = document.createElement("canvas"),
    mask = document.createElement("canvas");
  scratch.width = scratch.height = mask.width = mask.height = RETOUCH_TILE_SIZE;
  return {
    builder: new RetouchCoverageBuilder(
      geometry.imageWidth,
      geometry.imageHeight,
      radius,
      hardness,
    ),
    scratch,
    mask,
    tiles: new Set(),
    rendered: new Set(),
    points: [],
    steps: null,
    finishRequested: false,
    alpha: new ImageData(RETOUCH_TILE_SIZE, RETOUCH_TILE_SIZE),
  };
}

export function drawSampledPreview(
  stage: HTMLElement,
  canvas: HTMLCanvasElement,
  points: RetouchLivePoint[],
  geometry: RetouchLiveGeometry,
  style: {
    sampled?: SampledRetouchSettings;
    sourceImage?: HTMLImageElement | null;
    radiusPx: number;
  },
  redraw = false,
  finished = false,
): boolean {
  const settings = style.sampled,
    source = style.sourceImage;
  if (!settings || !source?.complete || !source.naturalWidth) return false;
  const context = canvas.getContext("2d");
  if (!context) return false;
  let state = previews.get(stage);
  if (!state) {
    state = createPreview(geometry, style.radiusPx, settings.hardness);
    previews.set(stage, state);
  }
  state.points.push(...points);
  state.finishRequested ||= finished;
  const pending = advancePreview(state);
  const dirty = new Set(state.builder.takeDirtyTiles());
  for (const tile of dirty) state.tiles.add(tile);
  if (redraw) state.rendered.clear();
  renderVisibleTiles(state, dirty, canvas, context, source, geometry, settings);
  return pending;
}

function advancePreview(state: Preview): boolean {
  const deadline = performance.now() + 4;
  do {
    if (!state.steps && state.points.length)
      state.steps = state.builder.appendSteps(state.points.splice(0));
    if (state.steps) {
      if (state.steps.next().done) state.steps = null;
    } else {
      if (state.finishRequested) {
        state.builder.finish();
        state.finishRequested = false;
      }
      break;
    }
  } while (performance.now() < deadline);
  return Boolean(state.steps || state.points.length || state.finishRequested);
}

function renderVisibleTiles(
  state: Preview,
  dirty: Set<CoverageTile>,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  source: HTMLImageElement,
  geometry: RetouchLiveGeometry,
  settings: SampledRetouchSettings,
): void {
  const rect = canvas.getBoundingClientRect();
  const sx = rect.width / geometry.imageWidth,
    sy = rect.height / geometry.imageHeight;
  for (const tile of state.tiles) {
    if (
      rect.left + (tile.x + RETOUCH_TILE_SIZE) * sx < 0 ||
      rect.top + (tile.y + RETOUCH_TILE_SIZE) * sy < 0 ||
      rect.left + tile.x * sx > window.innerWidth ||
      rect.top + tile.y * sy > window.innerHeight
    ) {
      if (dirty.has(tile)) state.rendered.delete(tile);
      continue;
    }
    if (!dirty.has(tile) && state.rendered.has(tile)) continue;
    renderTile(state, context, source, tile, geometry, settings);
    state.rendered.add(tile);
  }
}

function renderTile(
  state: Preview,
  context: CanvasRenderingContext2D,
  source: HTMLImageElement,
  tile: CoverageTile,
  geometry: RetouchLiveGeometry,
  settings: SampledRetouchSettings,
): void {
  const scratch = state.scratch.getContext("2d"),
    mask = state.mask.getContext("2d");
  if (!scratch || !mask) return;
  const width = Math.min(RETOUCH_TILE_SIZE, geometry.imageWidth - tile.x),
    height = Math.min(RETOUCH_TILE_SIZE, geometry.imageHeight - tile.y);
  for (let i = 0; i < tile.coverage.length; i++)
    state.alpha.data[i * 4 + 3] = Math.round(
      tile.coverage[i] * settings.opacity * 255,
    );
  mask.putImageData(state.alpha, 0, 0);
  scratch.clearRect(0, 0, RETOUCH_TILE_SIZE, RETOUCH_TILE_SIZE);
  scratch.globalCompositeOperation = "source-over";
  scratch.drawImage(
    source,
    tile.x + settings.offset.x,
    tile.y + settings.offset.y,
    width,
    height,
    0,
    0,
    width,
    height,
  );
  scratch.globalCompositeOperation = "destination-in";
  scratch.drawImage(state.mask, 0, 0);
  const sx = geometry.displayWidth / geometry.imageWidth,
    sy = geometry.displayHeight / geometry.imageHeight;
  context.clearRect(tile.x * sx, tile.y * sy, width * sx, height * sy);
  context.drawImage(
    state.scratch,
    0,
    0,
    width,
    height,
    tile.x * sx,
    tile.y * sy,
    width * sx,
    height * sy,
  );
}
