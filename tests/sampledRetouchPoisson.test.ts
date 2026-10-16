import { expect, it } from "vitest";
import {
  createPoissonDomain,
  solvePoissonChannel,
} from "../src/main/inpainting/retouchPoisson";
import {
  RetouchCoverageBuilder,
  buildRetouchCoverage,
} from "../src/shared/sampledRetouch";

it("matches an independent converged Jacobi reference across tile edges and disconnected islands", () => {
  const width = 540;
  const positions: number[] = [];
  for (let y = 2; y < 18; y++)
    for (let x = 248; x < 268; x++) {
      if (x !== 258 && !(x === 253 && y === 8)) positions.push(y * width + x);
    }
  const boundary = (p: number) => Math.sin(p * 0.13) * 0.4;
  const indices = new Map(positions.map((p, i) => [p, i]));
  let reference = new Float64Array(positions.length);
  for (let iteration = 0; iteration < 4000; iteration++) {
    const next = new Float64Array(reference.length);
    positions.forEach((p, i) => {
      for (const neighbor of [p - 1, p + 1, p - width, p + width]) {
        const j = indices.get(neighbor);
        next[i] += (j === undefined ? boundary(neighbor) : reference[j]) / 4;
      }
    });
    reference = next;
  }
  const actual = solvePoissonChannel(
    createPoissonDomain(Int32Array.from(positions), width),
    boundary,
    () => {},
  );
  expect(
    Math.max(...actual.map((value, i) => Math.abs(value - reference[i]))),
  ).toBeLessThan(0.0002);
});

it("keeps coverage independent of event batches and includes the final endpoint", () => {
  const points = [
    { x: 5, y: 8 },
    { x: 35, y: 20 },
    { x: 90, y: 50 },
  ];
  const all = buildRetouchCoverage(100, 100, points, 7, 0.5);
  const builder = new RetouchCoverageBuilder(100, 100, 7, 0.5);
  points.forEach((point) => builder.append([point]));
  expect(builder.finish()).toEqual(all);
});

it("rejects an over-budget stroke before allocating a full page", () => {
  expect(() =>
    buildRetouchCoverage(10000, 12000, [{ x: 5000, y: 6000 }], 1000, 1),
  ).toThrow("획이 너무 큽니다");
});

it("checks cancellation inside the iterative solver", () => {
  const positions = Int32Array.from(
    { length: 400 },
    (_, i) => (Math.floor(i / 20) + 1) * 24 + (i % 20) + 1,
  );
  expect(() =>
    solvePoissonChannel(
      createPoissonDomain(positions, 24),
      (p) => Math.sin(p),
      () => {
        throw new Error("cancelled");
      },
    ),
  ).toThrow("cancelled");
});
