import { PNG } from "pngjs";
import { McpEditError } from "../application/mcpEditPolicy";
import { restoreHiddenPixels } from "../imageRedactionPixels";
import { decodeMcpUploadPng } from "./mcpImageUploadPng";
import type {
  McpExternalRasterInput,
  McpImageOperations,
} from "./mcpImageWorkerProtocol";

export function composeExternalLetteringRaster(assets: McpExternalRasterInput) {
  const image = decodeMcpUploadPng(bytes(assets.image), {
    ...assets,
    purpose: "image",
  }).png;
  const mask = effectiveMask(assets);
  for (let i = 0; i < mask.selected.length; i++)
    if (!mask.selected[i]) image.data.fill(0, i * 4, i * 4 + 4);
  const result = PNG.sync.write(image);
  if (result.length > 2 * 1024 * 1024)
    throw new McpEditError(
      "invalid_edit",
      "Lettering PNG exceeds the 2 MiB per-layer limit; no resizing was performed.",
    );
  return {
    bytes: Uint8Array.from(result),
    mask: mask.selected,
    width: assets.width,
    height: assets.height,
    selectedPixels: count(mask.selected),
    protectedPixels: count(mask.protected),
    changedPixels: 0,
  };
}

export function composeExternalBackgroundRaster(
  input: McpImageOperations["background"]["input"],
) {
  const image = decodeMcpUploadPng(bytes(input.image), {
    ...input,
    purpose: "image",
  }).png;
  const mask = effectiveMask(input);
  const before = bytes(input.before);
  const after = Buffer.alloc(before.length);
  before.copy(after);
  const pageMask = new Uint8Array(input.pageWidth * input.pageHeight);
  const hidden = new Uint8Array(pageMask.length).fill(1);
  const changedPixels = applyPatchPixels({
    rect: input.rect,
    imageData: image.data,
    pixels: bytes(input.pixels),
    mask: mask.selected,
    before,
    after,
    pageMask,
    hidden,
    width: input.pageWidth,
  });
  restoreHiddenPixels(before, after, hidden);
  return {
    bitmap: after,
    mask: pageMask,
    width: input.pageWidth,
    height: input.pageHeight,
    selectedPixels: count(mask.selected),
    protectedPixels: count(mask.protected),
    changedPixels,
  };
}

function effectiveMask(assets: McpExternalRasterInput) {
  const declared = {
    width: assets.width,
    height: assets.height,
    purpose: "mask" as const,
  };
  const selected = new Uint8Array(assets.width * assets.height).fill(1);
  const protectedMask = new Uint8Array(selected.length);
  if (assets.mask) {
    const png = decodeMcpUploadPng(bytes(assets.mask), declared).png;
    for (let i = 0; i < selected.length; i++)
      selected[i] = png.data[i * 4] ? 1 : 0;
  }
  if (assets.protectedMask) {
    const png = decodeMcpUploadPng(bytes(assets.protectedMask), declared).png;
    for (let i = 0; i < selected.length; i++) {
      protectedMask[i] = png.data[i * 4] ? 1 : 0;
      if (protectedMask[i]) selected[i] = 0;
    }
  }
  return { selected, protected: protectedMask };
}
function count(mask: Uint8Array) {
  return mask.reduce((total, value) => total + value, 0);
}
function bytes(value: Uint8Array): Buffer {
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function applyPatchPixels(input: {
  rect: { x: number; y: number; w: number; h: number };
  imageData: Buffer;
  pixels: Buffer;
  mask: Uint8Array;
  before: Buffer;
  after: Buffer;
  pageMask: Uint8Array;
  hidden: Uint8Array;
  width: number;
}) {
  const {
    rect,
    imageData,
    pixels,
    mask,
    before,
    after,
    pageMask,
    hidden,
    width,
  } = input;
  let changedPixels = 0;
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const source = y * rect.w + x,
        target = (y + rect.y) * width + x + rect.x;
      if (!mask[source]) continue;
      if (imageData[source * 4 + 3] !== 255)
        throw new McpEditError(
          "invalid_edit",
          "Selected background pixels must be opaque. Transparent lettering belongs in a lettering layer.",
        );
      pageMask[target] = 1;
      hidden[target] = 0;
      const value = pixels.subarray(source * 4, source * 4 + 4);
      if (!before.subarray(target * 4, target * 4 + 4).equals(value))
        changedPixels++;
      value.copy(after, target * 4);
    }
  }
  return changedPixels;
}
