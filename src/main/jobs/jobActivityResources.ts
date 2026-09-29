import type { AppSettings } from "../../shared/settingsTypes";
import type { ChapterSnapshot } from "../../shared/libraryTypes";
import type { StartInpaintingRequest } from "../../shared/inpaintingTypes";
import {
  libraryStructureResource,
  modelRuntimeResource,
  type AppActivityResource,
} from "../../shared/appActivityTypes";

export function inpaintingActivityResources(
  settings: AppSettings | undefined,
  request: StartInpaintingRequest,
): AppActivityResource[] | undefined {
  if (!settings) return undefined;
  const codex = "engine" in request && request.engine === "codex";
  const remoteOnly =
    codex &&
    request.mode === "page-pattern-drawn" &&
    !(
      request.postprocess?.bubbleLayout?.enabled ??
      settings.inpainting?.bubbleLayoutAfterInpainting
    );
  const resources: AppActivityResource[] = remoteOnly
    ? []
    : [{ kind: "model-runtime", scope: "*", access: "write" }];
  if (codex) resources.push({ kind: "codex-auth", scope: "*", access: "read" });
  return resources;
}

/**
 * Local Gemma owns the model runtime for the whole job. API/Codex jobs share
 * it: their OCR, detection and font stages take turns through the local
 * inference section, while remote requests run concurrently. A job that also
 * erases with a local inpainting model stays exclusive.
 */
export function translationActivityResources(
  settings: AppSettings,
  codexImages = false,
  localInpainting = false,
): AppActivityResource[] {
  return [
    modelRuntimeResource(settings.modelProvider === "gemma" || localInpainting),
    ...(settings.modelProvider === "openai-codex" || codexImages
      ? [{ kind: "codex-auth" as const, scope: "*", access: "read" as const }]
      : []),
  ];
}

export function reserveChapterTargets(
  chapter: ChapterSnapshot,
  pageIds: readonly string[],
): AppActivityResource[] {
  return [
    libraryStructureResource("work", chapter.workId, "read"),
    libraryStructureResource("chapter", chapter.id, "read"),
    ...pageIds.map((id) =>
      libraryStructureResource("page", `${chapter.id}/${id}`, "read"),
    ),
  ];
}
