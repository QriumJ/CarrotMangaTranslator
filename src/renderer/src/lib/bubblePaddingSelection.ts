import { resolveBubbleLayoutPaddingRatio } from "../../../shared/bubbleLayoutPadding";
import type { TranslationBlock } from "../../../shared/textTypes";

/**
 * Effective padding per block (its own value, else the global setting);
 * `null` when they differ, so an unset block equal to the global value
 * is not reported as mixed.
 */
export function resolveSelectionBubblePadding(
  blocks: readonly Pick<TranslationBlock, "bubbleLayoutPaddingRatio">[],
  globalRatio: number | undefined,
): number | null | undefined {
  if (!blocks.length) return undefined;
  const fallback = resolveBubbleLayoutPaddingRatio(globalRatio);
  const values = blocks.map((block) =>
    block.bubbleLayoutPaddingRatio === undefined
      ? fallback
      : resolveBubbleLayoutPaddingRatio(block.bubbleLayoutPaddingRatio),
  );
  const first = values[0] as number;
  return values.every((value) => Math.abs(value - first) < 1e-6) ? first : null;
}
