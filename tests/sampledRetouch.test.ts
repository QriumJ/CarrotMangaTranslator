import { describe, expect, it } from "vitest";
import { buildRetouchCoverage } from "../src/shared/sampledRetouch";
import {
  applyRetouchPatch,
  rasterSampledRetouch,
  updateRetouchDifferenceMask,
} from "../src/main/inpainting/sampledRetouchRaster";

function image(width: number, height: number, color = 100): Uint8Array {
  const pixels = new Uint8Array(width * height * 4).fill(color);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  return pixels;
}
const settings = {
  source: "current" as const,
  offset: { x: -5, y: 0 },
  opacity: 1,
  hardness: 1,
};

describe("sampled retouch raster", () => {
  it("samples the immutable pre-stroke image even when source and destination overlap", () => {
    const pixels = image(32, 12);
    for (let i = 0; i < pixels.length; i += 4) pixels[i] = (i / 4) % 32;
    const before = pixels.slice();
    const patch = rasterSampledRetouch(
      pixels,
      pixels,
      32,
      12,
      {
        points: [
          { x: 10, y: 6 },
          { x: 25, y: 6 },
        ],
        radiusPx: 2,
      },
      settings,
      "clone",
    );
    expect(pixels).toEqual(before);
    applyRetouchPatch(pixels, patch);
    for (let x = 10; x <= 25; x++) expect(pixels[(6 * 32 + x) * 4]).toBe(x - 5);
  });
  it("does not compound opacity when a stroke retraces its path", () => {
    const base = image(20, 20, 0),
      source = image(20, 20, 200);
    const run = (points: { x: number; y: number }[]) =>
      rasterSampledRetouch(
        base,
        source,
        20,
        20,
        { points, radiusPx: 3 },
        { ...settings, offset: { x: 0, y: 0 }, opacity: 0.5 },
        "clone",
      );
    const p = { x: 10, y: 10 };
    expect(run([p, p, p]).pixels).toEqual(run([p]).pixels);
    expect(run([p]).pixels[0]).toBe(100);
  });
  it("clips invalid sources and preserves straight-alpha composition", () => {
    const base = image(8, 8, 0),
      source = image(8, 8, 200);
    for (let i = 3; i < source.length; i += 4) source[i] = 128;
    const patch = rasterSampledRetouch(
      base,
      source,
      8,
      8,
      { points: [{ x: 0, y: 0 }], radiusPx: 2 },
      { ...settings, offset: { x: 0, y: 0 } },
      "clone",
    );
    expect(patch.pixels[0]).toBe(100);
    expect(patch.pixels[3]).toBe(255);
    expect(
      rasterSampledRetouch(
        base,
        source,
        8,
        8,
        { points: [{ x: 0, y: 0 }], radiusPx: 2 },
        settings,
        "clone",
      ).positions.length,
    ).toBe(0);
  });
  it("heals a constant offset across a tile boundary without seams", () => {
    const base = image(520, 80, 160),
      source = image(520, 80, 60);
    const patch = rasterSampledRetouch(
      base,
      source,
      520,
      80,
      {
        points: [
          { x: 240, y: 40 },
          { x: 275, y: 40 },
        ],
        radiusPx: 20,
      },
      { ...settings, offset: { x: 0, y: 0 } },
      "heal",
    );
    for (let i = 0; i < patch.pixels.length; i += 4)
      expect(patch.pixels[i]).toBe(160);
  });
  it("allocates sparse tiles for a long diagonal and checks cancellation", () => {
    const coverage = buildRetouchCoverage(
      10000,
      12000,
      [
        { x: 10, y: 10 },
        { x: 9990, y: 11990 },
      ],
      2,
      1,
    );
    expect(coverage.tiles.length).toBeLessThan(150);
    expect(coverage.pixels).toBeLessThan(100000);
    expect(() =>
      buildRetouchCoverage(10, 10, [{ x: 5, y: 5 }], 2, 1, () => {
        throw new Error("cancel");
      }),
    ).toThrow("cancel");
  });
  it("matches the existing difference mask threshold and clears restored pixels", () => {
    const original = image(2, 1),
      current = original.slice(),
      mask = new Uint8Array(2);
    current[0] = 102;
    current[7] = 252;
    updateRetouchDifferenceMask(original, current, mask);
    expect([...mask]).toEqual([0, 1]);
    current[7] = 255;
    updateRetouchDifferenceMask(original, current, mask, Int32Array.of(1));
    expect([...mask]).toEqual([0, 0]);
  });
  it("measures a 512 pixel healing region", () => {
    const base = image(600, 600, 150),
      source = image(600, 600, 80);
    const start = performance.now();
    const patch = rasterSampledRetouch(
      base,
      source,
      600,
      600,
      { points: [{ x: 300, y: 300 }], radiusPx: 256 },
      { ...settings, offset: { x: 0, y: 0 } },
      "heal",
    );
    console.log(
      `512px heal: ${(performance.now() - start).toFixed(1)}ms; scratch ${patch.scratchBytes} bytes`,
    );
    expect(patch.pixels[0]).toBe(150);
  }, 30000);
  it("converges on nonuniform manga-like texture and varying illumination", () => {
    const base = image(600, 600),
      source = image(600, 600);
    for (let y = 0; y < 600; y++)
      for (let x = 0; x < 600; x++) {
        const p = (y * 600 + x) * 4;
        for (let c = 0; c < 3; c++) {
          base[p + c] = 100 + Math.round(x / 12 + 20 * Math.sin(y / 75));
          source[p + c] = 40 + ((x + y) % 7) * 4;
        }
      }
    const timings: number[] = [];
    for (let run = 0; run < 8; run++) {
      const start = performance.now();
      const patch = rasterSampledRetouch(
        base,
        source,
        600,
        600,
        { points: [{ x: 300, y: 300 }], radiusPx: 256 },
        { ...settings, offset: { x: 0, y: 0 } },
        "heal",
      );
      timings.push(performance.now() - start);
      expect(patch.positions.length).toBeGreaterThan(200000);
    }
    console.log(
      `512px textured heal warm timings: ${timings.map((value) => value.toFixed(1)).join(", ")}ms`,
    );
  }, 30000);
});
