import { z } from "zod/v4";
import { McpFontSamplesInput } from "../../shared/mcpTypographyRead";
import type { McpFontCatalog } from "../application/mcpTypographyReadService";
import { McpEditError } from "../application/mcpEditPolicy";
import { McpInvalidParams } from "./mcpArguments";
import { textContent, type McpTool } from "./mcpReadTools";

type Sample = { label: string; dataUrl: string };
export function createMcpFontSamplesTool(ports: {
  catalog: () => Promise<McpFontCatalog>;
  render: (
    fontIds: string[],
    text: string,
    guard: () => void,
  ) => Promise<Sample[]>;
}): McpTool {
  const scopes = ["carrot.read", "carrot.images"];
  return {
    name: "carrot_get_font_samples",
    description:
      "Visually compare 1–4 app fonts using the actual page renderer, without saving or running any local/remote model. First list_fonts and retain its snapshot; only available registered IDs are accepted. Each image shows regular (left), bold (right), and 24/40/60px rows. The provided literal text is shortened to at most 8 graphemes to fit; each label states the actual specimen. Read source crops and previous-chapter rendered pages, choose fonts by visible strokes, apply with update_page_blocks or a format batch, then render and check. This is visual evidence, not an automatic match score or full glyph-coverage guarantee.",
    readOnly: true,
    destructive: false,
    idempotent: true,
    openWorld: false,
    requiredScopes: scopes,
    inputSchema: z.toJSONSchema(McpFontSamplesInput),
    invoke: async (args, context) => {
      const parsed = McpFontSamplesInput.safeParse(args);
      if (!parsed.success) throw new McpInvalidParams(parsed.error.issues);
      const input = parsed.data;
      const guard = () => context?.assertAuthorized();
      guard();
      const before = await ports.catalog();
      if (before.snapshot !== input.snapshot)
        throw new McpEditError(
          "revision_conflict",
          "Font inventory changed. List fonts again.",
        );
      for (const id of input.fontIds)
        if (
          !before.fonts.some(
            (font) => font.fontId === id && font.availability === "available",
          )
        )
          throw new McpEditError(
            "invalid_edit",
            "Choose available font IDs from list_fonts; no fallback font is substituted.",
          );
      const images = await ports.render(input.fontIds, input.text, guard);
      guard();
      if ((await ports.catalog()).snapshot !== input.snapshot)
        throw new McpEditError(
          "revision_conflict",
          "Font inventory changed while rendering. List fonts again.",
        );
      if (
        images.length !== input.fontIds.length ||
        images.some(
          (image) =>
            !image.dataUrl.startsWith("data:image/png;base64,") ||
            image.dataUrl.length > 3 * 1024 * 1024,
        )
      )
        throw new Error("Invalid font sample images.");
      guard();
      return [
        ...textContent({
          snapshot: before.snapshot,
          samples: images.map((image, index) => ({
            fontId: input.fontIds[index],
            label: image.label,
            contentIndex: index + 1,
          })),
          notes: [
            "visual_comparison_only_no_model_or_save",
            "specimen_may_be_shortened_see_each_label",
          ],
        }),
        ...images.map((image) => ({
          type: "image" as const,
          mimeType: "image/png" as const,
          data: image.dataUrl.slice("data:image/png;base64,".length),
        })),
      ];
    },
  };
}
