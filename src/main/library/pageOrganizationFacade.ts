import { notifyLinkedWorkspacePagesSaved } from "../linkedWorkspace/linkedWorkspaceNotifications";
import type { EditPageOrganizationRequest } from "../../shared/pageOrganization";
import type { ChapterSnapshot } from "../../shared/libraryTypes";
import {
  libraryStructureResource,
  pageContentResource,
} from "../../shared/appActivityTypes";
import { assertLibraryActivityAccess, withLibraryMutation } from "./lock";
import { editPageOrganizationUnlocked } from "../libraryStore/pageOrganizationMutation";

export async function editPageOrganization(
  request: EditPageOrganizationRequest,
  validateOutput?: (chapter: ChapterSnapshot) => Promise<void>,
): Promise<ChapterSnapshot> {
  const chapter = await withLibraryMutation(() => {
    assertLibraryActivityAccess([
      libraryStructureResource("chapter", request.chapterId),
      pageContentResource(request.chapterId, "**"),
    ]);
    return editPageOrganizationUnlocked(request, validateOutput);
  });
  notifyLinkedWorkspacePagesSaved(chapter.id, chapter.pageOrder, {
    organizationChanged: true,
  });
  return chapter;
}
