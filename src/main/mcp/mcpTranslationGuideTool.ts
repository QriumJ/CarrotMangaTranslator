import { z } from "zod/v4";
import {
  McpTranslationGuideInputSchema,
  McpTranslationGuideOutputSchema,
} from "../../shared/mcpTranslationGuide";
import { getTranslationGuide } from "../application/mcpTranslationGuide";
import type { McpLibraryReadPort } from "../application/mcpLibraryReadService";
import { textContent, type McpTool } from "./mcpReadTools";

export function createTranslationGuideTool(
  library: McpLibraryReadPort,
  toolNames: readonly string[],
): McpTool {
  return {
    name: "carrot_get_translation_guide",
    description:
      "START HERE for 'translate this chapter', '번역해줘' or a polished complete translation. Aim for one well-planned pass: read original expression, choose a consistent font palette and source-scale sizes, batch text/style/placement, then inspect the final pages once. Correct only specific remaining defects; do not schedule repeated full-chapter retries. Includes ALL text/SFX, image-generation-first routing and real rendered review. Host generation AND PNG byte delivery must be checked. Read-only; no models, edits, quota or queue started.",
    inputSchema: z.toJSONSchema(McpTranslationGuideInputSchema),
    requiredScopes: ["carrot.read"],
    readOnly: true,
    invoke: async (args, context) => {
      const input = McpTranslationGuideInputSchema.parse(args);
      const guard = context?.assertAuthorized ?? (() => {});
      const result = await getTranslationGuide(
        library,
        input,
        context?.visibleToolNames ?? toolNames,
        guard,
      );
      guard();
      return textContent(McpTranslationGuideOutputSchema.parse(result));
    },
  };
}
