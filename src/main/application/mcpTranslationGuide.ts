import type { z } from "zod/v4";
import type { McpContextSnapshot } from "./mcpContextEditPolicy";
import type { MangaPage } from "../../shared/libraryTypes";
import type { McpLibraryReadPort } from "./mcpLibraryReadService";
import { McpEditError } from "./mcpEditPolicy";
import {
  createPageRevision,
  createSoundEffectReviewPageRevision,
} from "../../shared/pageRevision";
import { mcpContextRevision } from "../../shared/mcpContextEditing";
import { McpTranslationGuideInputSchema } from "../../shared/mcpTranslationGuide";
import {
  McpImageRouteInputSchema,
  selectMcpImageRoute,
} from "../../shared/mcpTranslationQuality";
import { inspectTranslationSavedQuality } from "./mcpTranslationQuality";

const steps = [
  {
    id: "context",
    tools: ["carrot_get_work_context"],
    instruction:
      "Read saved rules, glossary, characters and previous chapter memory. Resolve speaker, honorific and terminology consistency. Finalize authorized context changes BEFORE preparing a composite; do not copy another work's names or lore.",
  },
  {
    id: "source",
    tools: [
      "carrot_get_page_preview",
      "carrot_get_page_crop",
      "carrot_get_page_blocks",
    ],
    instruction:
      "Read each original page once for BOTH meaning and lettering: identify the speaker, expression, visible glyph size/weight, writing direction and the usable space around each phrase. Plan a small chapter-wide font palette for dialogue, thought/narration, shouting, labels and SFX while reading; keep recurring styles consistent instead of inventing a style per block. Source direction describes the original writing, independently of Korean render direction. Inventory all text, including off-bubble writing and SFX; zero detector candidates never means no effects. Enlarge only ambiguous writing. OCR is a draft; do not invent unreadable text.",
  },
  {
    id: "plan",
    tools: ["carrot_prepare_composite", "carrot_prepare_workflow"],
    instruction:
      "Aim for one well-planned chapter pass and one final visual review. Decide wording and typography before writing; batch per-block choices across pages using the existing translation/format tools. Use qualityPolicy=complete-translation-v1 with existing composite/await-external contracts and fresh revisions. Declare the work and final review actually needed; maxReviewPasses is a ceiling, NOT a target or an instruction to schedule repeated correction cycles. Only a specific observed defect justifies a targeted correction. Do not repeatedly generate, render or restyle satisfactory pages, or spend tool calls proving the same unchanged state.",
  },
  {
    id: "text-and-sfx",
    tools: [
      "carrot_preview_translation_batch",
      "carrot_create_page_blocks",
      "carrot_get_sound_effects",
      "carrot_prepare_sound_effect_batch",
    ],
    instruction:
      "Translate with chapter context. Use native block creation for missed ordinary text; materialize detector/manual sound-effect regions with approved source and target text. Resolve every effect through translation, erasure and lettering; retain concrete unresolved reasons. Do not silently preserve Japanese SFX because translation was vaguely requested.",
  },
  {
    id: "images",
    tools: [
      "carrot_begin_image_upload",
      "carrot_write_image_upload",
      "carrot_finish_image_upload",
      "carrot_preview_external_image",
      "carrot_get_external_image_preview",
      "carrot_apply_external_image",
      "carrot_preview_image_edit",
      "carrot_generate_sound_effects",
      "carrot_run_page_erasure",
    ],
    instruction:
      "For artwork restoration, drawn text and SFX prefer the HOST image tool plus actual PNG byte delivery, then the configured app image controller, then local restoration/editable text. For app background restoration use carrot_run_page_erasure with engine=codex, blockId, allowExternalProcessing=true and expectedModel from get_sound_effects; omitting engine chooses local and is NOT the generative route. App lettering uses generate_sound_effects. Probe capabilities; never invent a model name, file handle or base64. Record per-region cumulative quality.imageHistory with hostAttempts/appAttempts, outcome and fallback reason; never drop prior attempts on correction or reconnect. Use exact-size region patches/protected masks; preserve surrounding art. Simple white bubbles may use native erasure. At most 3 generation attempts TOTAL per region across providers, calls and internal retries; pass prior attempts into app SFX generation. Policy refusal is terminal, not permission to switch providers.",
  },
  {
    id: "typography",
    tools: [
      "carrot_list_fonts",
      "carrot_get_font_samples",
      "carrot_preflight_typography",
      "carrot_run_typography_analysis",
      "carrot_preview_typography_batch",
      "carrot_apply_typography_batch",
      "carrot_preview_format_batch",
      "carrot_apply_format_batch",
    ],
    instruction:
      "Typeset as a manga letterer: preserve the original visual voice and make Korean comfortably readable at normal page-view scale. Keep dialogue editable. List fonts once, compare a few relevant samples once per style family, then explicitly apply the selected registered fontFamily, weight and per-block geometry in a chapter batch. Unset fontFamily is merely the app default, not a matched choice; there is no need for a different font in every block. fontSizePx is a nominal size in ORIGINAL IMAGE PIXELS, not browser UI pixels: an 18px font on a 1600px-tall page becomes about 9px when viewed at 800px tall. This illustrates scale, not a fixed minimum. Compare visible Korean glyphs with the original at the SAME scale, preserving emphasis and intentionally small asides. If source-size evidence would help, run one batched typography analysis and apply through preview/apply_typography_batch; measured face pixels are not fontSizePx. Do not hardcode a generic 18/20/22px palette or overwrite source matching with arbitrary manual sizes. For off-bubble text choose the usable clear region FIRST; retain a deliberate vertical composition or reflow horizontally without spreading onto faces, hair or panel borders. Fit phrase breaks and text density to that space; a tiny sentence floating in a large balloon is not good fitting. Do not solve overflow merely by shrinking all text or stretching a box across artwork. preserveManualFontSize=false is appropriate when the authorized task includes correcting those sizes; otherwise preserve the user's deliberate edits. Apply text, style and placement coherently, not as a chain of speculative tweaks.",
  },
  {
    id: "review",
    tools: [
      "carrot_accept_workflow_external",
      "carrot_get_composite_review_image",
      "carrot_submit_composite_review",
      "carrot_render_page_preview",
    ],
    instruction:
      "After native saves settle, acknowledge waiting external pages at CURRENT revisions and resume. Inspect each final rendered page once at normal reading scale beside its original; zoom only suspicious details. Ask whether the dialogue reads effortlessly, emphasis survives and lettering belongs in the artwork. Check generated glyphs against the approved wording. A successful save, reviewStatus=reviewed, overflow=false or readable zoomed crop does not answer those visual questions. Submit assessments tied to the actual images. If a specific defect remains, identify its cause and change only the affected text/style/placement, then inspect the changed result; do not rerun the chapter or repeat unchanged calls. Stop when the result is good, not after a prescribed number of passes. Unresolved issues remain partial completion. Poll asynchronous jobs to terminal without starting duplicate work.",
  },
];

export async function getTranslationGuide(
  library: McpLibraryReadPort,
  input: z.infer<typeof McpTranslationGuideInputSchema>,
  visibleTools: readonly string[],
  guard: () => void,
) {
  guard();
  const saved = await library.readContext?.(input.chapterId);
  const chapter =
    saved?.chapter ?? (await library.openChapter(input.chapterId));
  const index = await library.listLibrary();
  guard();
  const selected = new Set(
    input.pageIds ?? chapter.pages.map((page) => page.id),
  );
  const pages = chapter.pages.filter((page) => selected.has(page.id));
  if (
    chapter.id !== input.chapterId ||
    pages.length !== selected.size ||
    pages.length > 50
  )
    throw new McpEditError(
      "invalid_edit",
      "Select at most 50 existing pages in the identified chapter; no silent truncation.",
    );
  const work = index.works.find((item) => item.id === chapter.workId);
  const previousChapterId = previousChapter(
    work?.chapterOrder ?? [],
    chapter.id,
  );
  const available = new Set(visibleTools);
  const capabilities = McpImageRouteInputSchema.parse(
    input.imageCapabilities ?? {},
  );
  const required = [...new Set(steps.flatMap((step) => step.tools))];
  return {
    chapterId: chapter.id,
    workId: chapter.workId,
    previousChapterId,
    context: contextSummary(saved),
    pages: pages.map(guidePage),
    qualityPolicy: "complete-translation-v1" as const,
    maxReviewPasses: 3 as const,
    imageRoute: availableImageRoute(capabilities, available),
    capabilityOrigin:
      "mcp-tools-server-observed; image-capabilities-host-reported" as const,
    availableTools: required.filter((name) => available.has(name)),
    missingTools: required.filter((name) => !available.has(name)),
    steps: steps.map((step) => ({
      ...step,
      tools: step.tools.filter((name) => available.has(name)),
    })),
    completionCriteria: [
      "Every original page visually inspected, including unrecognized/off-bubble text.",
      "All dialogue and sound effects translated, erased and typeset, or explicitly unresolved.",
      "Fresh retrieved native render evidence plus every page quality assessment; host visual judgment is not server certification.",
      "No unresolved blocking checks. Aim to pass the first final review; only observed defects warrant targeted corrections within the existing review ceiling.",
      "No generated image is accepted from a filename; validate actual PNG bytes and final transformed rendering.",
    ],
    modelStarted: false as const,
    qualityVerified: false as const,
  };
}

function contextSummary(saved: McpContextSnapshot | undefined) {
  return {
    revision: saved ? mcpContextRevision(saved) : null,
    glossaryEntries:
      saved?.styleGuide.glossary.filter((item) => item.enabled).length ?? 0,
    characters:
      saved?.styleGuide.characters.filter((item) => item.enabled).length ?? 0,
    memoryPages: saved?.storyMemory.pages.length ?? 0,
    state: saved ? ("available" as const) : ("unavailable" as const),
  };
}
function guidePage(page: MangaPage) {
  return {
    pageId: page.id,
    revision: createPageRevision(page),
    reviewRevision: createSoundEffectReviewPageRevision(page),
    width: page.width,
    height: page.height,
    blocks: page.blocks.length,
    explicitFonts: page.blocks.filter((block) => block.fontFamily).length,
    savedQuality: inspectTranslationSavedQuality(page),
    requiresVisualSourceInspection: true as const,
  };
}

function previousChapter(order: string[], chapterId: string) {
  const index = order.indexOf(chapterId);
  return index > 0 ? order[index - 1] : null;
}

function availableImageRoute(
  capabilities: ReturnType<typeof McpImageRouteInputSchema.parse>,
  tools: Set<string>,
) {
  const imageTools = [
    "carrot_begin_image_upload",
    "carrot_write_image_upload",
    "carrot_finish_image_upload",
    "carrot_preview_external_image",
    "carrot_apply_external_image",
  ];
  const scoped = { ...capabilities };
  if (!imageTools.every((name) => tools.has(name)))
    scoped.hostFileTransfer = "unavailable";
  if (
    !tools.has("carrot_generate_sound_effects") &&
    !tools.has("carrot_run_page_erasure")
  )
    scoped.appGeneration = "unavailable";
  return selectMcpImageRoute(scoped);
}
