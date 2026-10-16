import { expect, it } from "vitest";
import { InpaintingRetouchRequestSchema } from "../src/shared/ipcJobSchemas";
import { updateRetouchDifferenceMask } from "../src/main/inpainting/sampledRetouchRaster";
import {
  applyRetouchRequestWithWorker,
  cancelSampledRetouch,
} from "../src/main/inpainting/sampledRetouchClient";
import type { MangaPage } from "../src/shared/libraryTypes";

const request = {
  chapterId: "11111111-1111-4111-8111-111111111111",
  pageId: "22222222-2222-4222-8222-222222222222",
  expectedRevision: "page-v1:0123456789abcdef",
  mode: "clone",
  requestId: "33333333-3333-4333-8333-333333333333",
  geometry: { kind: "stroke", points: [{ x: 10, y: 20 }], radiusPx: 20 },
  sampled: {
    source: "current",
    offset: { x: -5, y: 2 },
    opacity: 1,
    hardness: 0.5,
  },
};
it("honors a cancellation received before a queued stroke starts", async () => {
  const parsed = InpaintingRetouchRequestSchema.parse(request);
  await cancelSampledRetouch(12, request.requestId);
  await expect(
    applyRetouchRequestWithWorker(
      {} as MangaPage,
      parsed,
      { runtimeDir: "unused", isPackaged: false },
      12,
    ),
  ).rejects.toThrow("취소");
  await expect(
    applyRetouchRequestWithWorker(
      {} as MangaPage,
      { ...parsed, sampled: undefined },
      { runtimeDir: "unused", isPackaged: false },
      12,
    ),
  ).rejects.toThrow("누락");
});
it("accepts sampled strokes while rejecting path injection, fractional offsets and shape modes", () => {
  expect(InpaintingRetouchRequestSchema.safeParse(request).success).toBe(true);
  for (const invalid of [
    { ...request, sampled: undefined },
    { ...request, requestId: undefined },
    { ...request, sampled: { ...request.sampled, path: "outside.png" } },
    { ...request, sampled: { ...request.sampled, offset: { x: 0.2, y: 0 } } },
    {
      ...request,
      geometry: {
        kind: "rectangle",
        start: { x: 0, y: 0 },
        end: { x: 5, y: 5 },
      },
    },
  ])
    expect(InpaintingRetouchRequestSchema.safeParse(invalid).success).toBe(
      false,
    );
});
it("preserves old paint/restore contracts", () => {
  for (const mode of ["paint", "restore"]) {
    const { sampled: _sampled, requestId: _requestId, ...old } = request;
    expect(
      InpaintingRetouchRequestSchema.safeParse({ ...old, mode }).success,
    ).toBe(true);
    expect(
      InpaintingRetouchRequestSchema.safeParse({ ...request, mode }).success,
    ).toBe(false);
  }
});
it("uses the characterized Electron premultiplied difference threshold for transparent pixels", () => {
  // Electron 44.5.1 nativeImage.toBitmap: RGBA [200,100,50,128] -> BGRA [25,50,100,128].
  const original = Uint8Array.from([
    200, 100, 50, 128, 200, 100, 50, 0, 200, 100, 50, 255,
  ]);
  const output = Uint8Array.from([
    204, 100, 50, 128, 0, 0, 0, 0, 203, 100, 50, 255,
  ]);
  const mask = new Uint8Array(3);
  updateRetouchDifferenceMask(original, output, mask);
  expect([...mask]).toEqual([0, 0, 1]);
  output[0] = 206;
  updateRetouchDifferenceMask(original, output, mask, Int32Array.of(0));
  expect([...mask]).toEqual([1, 0, 1]);
});

it("retains the old point cap while accepting long sampled strokes", () => {
  const points = Array.from({ length: 1201 }, (_, x) => ({ x, y: 20 }));
  expect(
    InpaintingRetouchRequestSchema.safeParse({
      ...request,
      geometry: { ...request.geometry, points },
    }).success,
  ).toBe(true);
  expect(
    InpaintingRetouchRequestSchema.safeParse({
      ...request,
      mode: "paint",
      sampled: undefined,
      requestId: undefined,
      geometry: { ...request.geometry, points },
    }).success,
  ).toBe(false);
});
