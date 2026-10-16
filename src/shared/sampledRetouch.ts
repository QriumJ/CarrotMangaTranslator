type InpaintingPoint = { x: number; y: number };

export type SampledRetouchSettings = {
  source: "current" | "original";
  offset: InpaintingPoint;
  opacity: number;
  hardness: number;
};

export const RETOUCH_TILE_SIZE = 256;
const RETOUCH_SCRATCH_LIMIT = 128 * 1024 * 1024;

export type CoverageTile = { x: number; y: number; coverage: Float32Array };
export type RetouchCoverage = {
  tiles: CoverageTile[];
  pixels: number;
};

/** Streaming, max-coverage rasterizer. Spacing survives event/frame boundaries. */
export class RetouchCoverageBuilder {
  private readonly tiles = new Map<number, CoverageTile>();
  private readonly dirty = new Set<CoverageTile>();
  private pixels = 0;
  private cachedKey = -1;
  private cachedTile: CoverageTile | undefined;
  private last: InpaintingPoint | null = null;
  private remaining: number;
  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly radius: number,
    private readonly hardness: number,
    private readonly check: () => void = () => {},
  ) {
    this.remaining = Math.max(1, radius * 0.2);
  }
  append(points: readonly InpaintingPoint[]): void {
    for (const _step of this.appendSteps(points)) {
      // Workers consume all steps; renderer previews can yield between dabs.
    }
  }
  *appendSteps(points: readonly InpaintingPoint[]): Generator<void> {
    const spacing = Math.max(1, this.radius * 0.2);
    for (const point of points) {
      const previous = this.last;
      this.last = point;
      if (!previous) {
        this.dab(point.x, point.y);
        yield;
        continue;
      }
      const length = Math.hypot(point.x - previous.x, point.y - previous.y);
      let at = this.remaining;
      for (; at <= length; at += spacing) {
        this.dab(
          previous.x + ((point.x - previous.x) * at) / length,
          previous.y + ((point.y - previous.y) * at) / length,
        );
        yield;
      }
      this.remaining = at - length;
      yield;
    }
  }
  finish(): RetouchCoverage {
    if (this.last) this.dab(this.last.x, this.last.y);
    return { tiles: [...this.tiles.values()], pixels: this.pixels };
  }
  takeDirtyTiles(): CoverageTile[] {
    const result = [...this.dirty];
    this.dirty.clear();
    return result;
  }
  private dab(x: number, y: number): void {
    this.check();
    const left = Math.max(0, Math.ceil(x - this.radius)),
      right = Math.min(this.width - 1, Math.floor(x + this.radius));
    const top = Math.max(0, Math.ceil(y - this.radius)),
      bottom = Math.min(this.height - 1, Math.floor(y + this.radius));
    const radiusSquared = this.radius * this.radius;
    for (let py = top; py <= bottom; py++) {
      const dySquared = (py - y) ** 2;
      for (let px = left; px <= right; px++) {
        const squared = (px - x) ** 2 + dySquared;
        if (squared > radiusSquared) continue;
        const amount =
          this.hardness === 1
            ? 1
            : Math.min(
                1,
                (1 - Math.sqrt(squared) / this.radius) / (1 - this.hardness),
              );
        if (amount > 0) this.addPixel(px, py, amount);
      }
    }
  }
  private assertBudget(tileCount: number, pixelCount: number): void {
    if (
      tileCount * RETOUCH_TILE_SIZE ** 2 * 4 + pixelCount * 256 >
      RETOUCH_SCRATCH_LIMIT
    )
      throw new Error("획이 너무 큽니다. 짧게 나누어 작업해 주세요.");
  }
  private addPixel(x: number, y: number, amount: number): void {
    const tx = Math.floor(x / RETOUCH_TILE_SIZE),
      ty = Math.floor(y / RETOUCH_TILE_SIZE);
    const key = ty * Math.ceil(this.width / RETOUCH_TILE_SIZE) + tx;
    let tile = key === this.cachedKey ? this.cachedTile : this.tiles.get(key);
    if (!tile) {
      this.assertBudget(this.tiles.size + 1, this.pixels);
      tile = {
        x: tx * RETOUCH_TILE_SIZE,
        y: ty * RETOUCH_TILE_SIZE,
        coverage: new Float32Array(RETOUCH_TILE_SIZE ** 2),
      };
      this.tiles.set(key, tile);
    }
    this.cachedKey = key;
    this.cachedTile = tile;
    const i = (y - tile.y) * RETOUCH_TILE_SIZE + x - tile.x;
    if (tile.coverage[i] >= amount) return;
    if (tile.coverage[i] === 0) {
      this.assertBudget(this.tiles.size, this.pixels + 1);
      this.pixels++;
    }
    tile.coverage[i] = amount;
    this.dirty.add(tile);
  }
}

export function buildRetouchCoverage(
  width: number,
  height: number,
  points: readonly InpaintingPoint[],
  radius: number,
  hardness: number,
  check: () => void = () => {},
): RetouchCoverage {
  const builder = new RetouchCoverageBuilder(
    width,
    height,
    radius,
    hardness,
    check,
  );
  builder.append(points);
  return builder.finish();
}

export function visitRetouchCoverage(
  coverage: RetouchCoverage,
  width: number,
  visit: (index: number, amount: number, x: number, y: number) => void,
): void {
  for (const tile of coverage.tiles) {
    for (let i = 0; i < tile.coverage.length; i++) {
      const amount = tile.coverage[i];
      if (amount <= 0) continue;
      const x = tile.x + (i % RETOUCH_TILE_SIZE);
      const y = tile.y + Math.floor(i / RETOUCH_TILE_SIZE);
      visit(y * width + x, amount, x, y);
    }
  }
}
