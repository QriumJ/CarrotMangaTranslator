import React from "react";
import type { TranslationBlock } from "../../../shared/textTypes";
import { useFonts } from "../fonts/useFonts";
import { resolveBlockTextLayout } from "../lib/overlayLayout";
import { resolveOutputLineRanges } from "../lib/inlineLineMetrics";
import type { RichTranslationEditorController } from "./useRichTranslationEditorController";

export function useRichTranslationOutputSelection(
  block: TranslationBlock,
  value: string,
  pageSize: { width: number; height: number } | null | undefined,
  resolvedFontSizePx: number | null | undefined,
  controller: RichTranslationEditorController,
): (() => void) | undefined {
  const { catalog } = useFonts();
  return React.useMemo(() => {
    if (!pageSize) return undefined;
    const layout = resolveBlockTextLayout(
      block,
      value,
      pageSize,
      pageSize,
      catalog,
      { dialogueFontSizePx: resolvedFontSizePx ?? undefined },
    );
    if (!layout.lines) return undefined;
    return () => {
      const ranges = resolveOutputLineRanges(
        layout.lines ?? [],
        controller.plainText,
      );
      const { start, end } = controller.selection;
      const selected = ranges.filter((range, index) =>
        start === end
          ? start >= range.start &&
            start < (ranges[index + 1]?.start ?? Infinity)
          : start < range.end && end > range.start,
      );
      if (!selected.length) return;
      controller.selectTextRange(
        selected[0].start,
        selected[selected.length - 1].end,
      );
    };
  }, [block, catalog, controller, pageSize, resolvedFontSizePx, value]);
}
