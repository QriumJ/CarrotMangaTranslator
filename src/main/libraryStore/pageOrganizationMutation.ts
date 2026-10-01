import { prepareLibraryPageOrdering } from "./libraryPageOrdering";
import {
  EditPageOrganizationRequestSchema,
  applyPageOrganizationNames,
  pageOrganizationRevision,
  type EditPageOrganizationRequest,
} from "../../shared/pageOrganization";
import { assertUniquePageOutputNames } from "../../shared/pageOutputNaming";
import type { ChapterSnapshot } from "../../shared/libraryTypes";
import { findChapterLocation } from "./libraryFiles";
import {
  prepareLibraryOrganizationUnlocked,
  commitLibraryOrganizationUnlocked,
} from "./libraryOrganization";
import { hydrateChapter } from "./chapterSnapshots";

export async function editPageOrganizationUnlocked(
  raw: EditPageOrganizationRequest,
  validateOutput?: (chapter: ChapterSnapshot) => Promise<void>,
): Promise<ChapterSnapshot> {
  const request = EditPageOrganizationRequestSchema.parse(raw);
  const location = await findChapterLocation(request.chapterId);
  if (!location) throw new Error("화를 찾지 못했습니다.");
  const change = await prepareLibraryOrganizationUnlocked({
    kind: "reorder-pages",
    workId: location.workId,
    chapterId: request.chapterId,
    pageIds: request.pageIds,
  });
  const before = change.before.chapter;
  const after = change.after.chapter;
  if (
    !before ||
    !after ||
    pageOrganizationRevision(before) !== request.revision
  )
    throw new Error(
      "페이지 이름이나 순서가 변경되었습니다. 다시 불러온 뒤 저장해 주세요.",
    );
  const ids = new Set(before.pages.map((page) => page.id));
  if (
    request.pageIds.length !== ids.size ||
    new Set(request.pageIds).size !== ids.size ||
    request.pageIds.some((id) => !ids.has(id))
  )
    throw new Error("페이지 목록이 변경되었습니다.");
  after.pages = applyPageOrganizationNames(after.pages, request.names);
  assertUniquePageOutputNames(after.pages);
  if (change.after.pageOrdering)
    change.after.pageOrdering = prepareLibraryPageOrdering(
      after,
      change.after.pageOrdering,
      request.pageIds,
      after.updatedAt,
    ).ordering;
  const snapshot = hydrateChapter(after);
  await commitLibraryOrganizationUnlocked(change, {
    guard: () => {},
    stage: async () => {
      await validateOutput?.(snapshot);
    },
  });
  return snapshot;
}
