import type { MangaPage } from "../../shared/libraryTypes";
import type { TranslationBlock } from "../../shared/textTypes";
import type { McpSoundEffectPrepare } from "../../shared/mcpSoundEffects";
import { normalizeBboxTo1000 } from "../../shared/bboxNormalization";
import { hashStableValue } from "../../shared/blockFingerprint";
import { generatedLettering } from "../../shared/blockFormatValueSchemas";
import type { startCodexImageSession } from "../codexImageSession";
import { translatedPageReading } from "../codexImageEditing";
import { generateLetteringLayers } from "../pipeline/codexTypesettingLettering";
import { prepareExternalImageFile } from "../imageRedactionContext";
import { McpEditError } from "../application/mcpEditPolicy";
import { inspectGeneratedLettering } from "../application/codexTypesettingReadback";
import type {
  CodexTypesettingPorts,
  TypesettingIssue,
} from "../application/codexTypesettingContracts";
type Command = Extract<McpSoundEffectPrepare["command"], { kind: "generate" }>;
export async function generateSoundEffectLayer(
  page: MangaPage,
  block: TranslationBlock,
  command: Command,
  client: Awaited<ReturnType<typeof startCodexImageSession>>,
  directory: string,
  signal: AbortSignal,
  ask: CodexTypesettingPorts["ask"],
) {
  const target = await soundEffectTarget(page, block);
  const render = target.blocks[0].renderBbox;
  const reading = translatedPageReading(target, "image");
  let issues: TypesettingIssue[] = [];
  const previousAttempts = command.priorGenerationAttempts?.[block.id] ?? 0;
  for (let attempt = previousAttempts + 1; attempt <= 3; attempt++) {
    const result = await generateLetteringLayers(
      target,
      reading,
      (id) => id,
      client,
      directory,
      signal,
      {
        attempt,
        issues,
        invertColors: command.invertColors,
        plan: {
          groups: [
            {
              id: block.id,
              description: "",
              members: [{ regionId: block.id, bold: false, italic: false }],
            },
          ],
          fonts: [],
          sfxRendering: "image",
        },
      },
    );
    if (!result.page.blocks[0].imageGenerationBlocked) {
      issues = await inspectGeneratedLettering(result.page, reading, attempt, {
        ask,
        blockId: (id) => id,
        targetLanguage: "target-script",
      });
      signal.throwIfAborted();
      if (issues.length) continue;
    }
    return projectLayer(
      block,
      result.page.blocks[0],
      render,
      command.allowRenderAdjustment,
    );
  }
  throw new McpEditError(
    "invalid_edit",
    `Generated lettering failed independent readback after 3 attempts; use editable text or report unresolved; do not reset the per-region attempt budget. ${issues.map((issue) => issue.reason).join("; ")}`,
  );
}
async function soundEffectTarget(page: MangaPage, block: TranslationBlock) {
  const source = normalizeBboxTo1000(block.bbox, page, block.bboxSpace);
  const render = normalizeBboxTo1000(
    block.renderBbox ?? block.bbox,
    page,
    block.renderBbox
      ? (block.renderBboxSpace ?? block.bboxSpace)
      : block.bboxSpace,
  );
  const normalized = {
    ...block,
    bbox: source,
    renderBbox: render,
    bboxSpace: "normalized_1000" as const,
    renderBboxSpace: "normalized_1000" as const,
  };
  const {
    soundEffectReview: _review,
    blockOrder: _order,
    ...sourcePage
  } = page;
  return {
    ...sourcePage,
    blockOrder: [block.id],
    imagePath: await prepareExternalImageFile(page.imagePath),
    blocks: [normalized],
  };
}
function projectLayer(
  block: TranslationBlock,
  output: TranslationBlock,
  render: TranslationBlock["bbox"],
  allowAdjustment: boolean,
) {
  if (output.imageGenerationBlocked)
    return { ...block, imageGenerationBlocked: output.imageGenerationBlocked };
  const image = generatedLettering.parse(output.generatedLettering);
  if (
    image.sourceText !== block.sourceText ||
    image.translatedText !== block.translatedText
  )
    throw new McpEditError(
      "invalid_edit",
      "Generated layer metadata changed the approved text.",
    );
  const adjusted =
    hashStableValue(output.renderBbox ?? render) !== hashStableValue(render);
  if (adjusted && !allowAdjustment)
    throw new McpEditError(
      "invalid_edit",
      "Native foreground canvas requires explicit allowRenderAdjustment; existing geometry was preserved.",
    );
  return {
    ...block,
    generatedLettering: image,
    ...(adjusted
      ? {
          renderBbox: output.renderBbox,
          renderBboxSpace: "normalized_1000" as const,
        }
      : {}),
  };
}
