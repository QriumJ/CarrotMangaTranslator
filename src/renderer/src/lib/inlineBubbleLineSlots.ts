import { isUsableBubbleLayout } from "../../../shared/bubbleLayout";
import { resolveDisjointBubbleLayout } from "../../../shared/bubbleLayoutDisjoint";
import type { RenderTextDirection } from "../../../shared/textTypes";
import { resolveBubbleRegionLineInterval } from "./bubbleTextLayout";
import { applyInlineLineMetrics } from "./inlineLineMetrics";
import type { BlockTextLine, TextLineSlot } from "./textLineTypes";

/** Re-intersect every moved line band with the original shape, never widen it
 * by guessing from the previous slot. Region order and centers are preserved. */
export function resolveInlineBubbleSlots(
  lines: BlockTextLine[],
  originalSlots: readonly TextLineSlot[],
  value: unknown,
  lineHeightPx: number,
  fontSizePx: number,
  blockExtentPx: number,
  inlineExtentPx: number,
  fontWidthScale: number,
  direction: RenderTextDirection,
): TextLineSlot[] | null {
  if (!isUsableBubbleLayout(value)) return null;
  const layout =
    resolveDisjointBubbleLayout(value, { blockExtentPx, inlineExtentPx }) ??
    value;
  applyInlineLineMetrics(lines, lineHeightPx, fontSizePx);
  const vertical = direction === "vertical";
  const blockScale = vertical ? fontWidthScale : 1;
  const inlineScale = vertical ? 1 : fontWidthScale;
  const result: TextLineSlot[] = [];
  for (const [regionIndex, region] of layout.regions.entries()) {
    const indices = originalSlots.flatMap((slot, index) =>
      slot.regionIndex === regionIndex ? [index] : [],
    );
    if (!indices.length) continue;
    const starts = indices.map((index) => originalSlots[index].blockOffsetPx);
    const center =
      (Math.min(...starts) + Math.max(...starts) + lineHeightPx) / 2;
    const advances = indices.map((index, local) =>
      resolveLineAdvance(lines[index], local, lineHeightPx),
    );
    const extent =
      lineHeightPx + advances.reduce((sum, advance) => sum + advance, 0);
    let distance = 0;
    for (const [local, index] of indices.entries()) {
      distance += advances[local];
      const offset = resolveLineOffset(
        vertical,
        center,
        extent,
        lineHeightPx,
        distance,
      );
      const start = (offset * blockScale) / blockExtentPx;
      const end = ((offset + lineHeightPx) * blockScale) / blockExtentPx;
      if (start < 0 || end > 1) return null;
      const interval = resolveBubbleRegionLineInterval(region, start, end);
      if (!interval) return null;
      result[index] = {
        blockOffsetPx: offset,
        inlineOffsetPx: (interval.inlineStart * inlineExtentPx) / inlineScale,
        availableWidth:
          ((interval.inlineEnd - interval.inlineStart) * inlineExtentPx) /
          inlineScale,
        regionIndex,
      };
    }
  }
  return result.length === originalSlots.length ? result : null;
}

function resolveLineAdvance(
  line: BlockTextLine | undefined,
  index: number,
  height: number,
): number {
  return index === 0 ? 0 : height + (line?.leadingOffsetPx ?? 0);
}

function resolveLineOffset(
  vertical: boolean,
  center: number,
  extent: number,
  height: number,
  distance: number,
): number {
  return vertical
    ? center + extent / 2 - height - distance
    : center - extent / 2 + distance;
}
