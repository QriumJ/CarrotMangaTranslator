import type { TFunction } from "i18next";
import type {
  LibraryChapterSummary,
  LibraryIndex,
} from "../../../shared/libraryTypes";
import type {
  LinkedWorkspaceStatus,
  OrganizeLinkedResultsRequest,
} from "../../../shared/linkedWorkspaceTypes";
import {
  buildOrganizeLinkedResultsCommand,
  buildOpenPreviousLinkedResultsCommand,
  buildViewLinkedResultsCommand,
  canOrganizeLinkedResults,
  getLinkedResultIssue,
  type LinkedResultIssue,
} from "./linkedResultsCommands";

/** Result folders of every library chapter, acted on at the clicked scope. */
export type LibraryResultActions = {
  statuses: ReadonlyMap<string, LinkedWorkspaceStatus>;
  isOrganizing: (target?: OrganizeLinkedResultsRequest) => boolean;
  viewResults: (chapterId?: string) => Promise<void>;
  openPreviousFolder: (chapterId?: string) => Promise<void>;
  organize: (target?: OrganizeLinkedResultsRequest) => Promise<void>;
};

type MenuItem = { label: string; run: () => void; disabled?: boolean };

/** Issue shown in a chapter row; a local scoped run reads as moving at once. */
export function resolveChapterResultIssue(
  results: LibraryResultActions | undefined,
  workId: string,
  chapterId: string,
): LinkedResultIssue | null {
  if (!results) return null;
  if (
    canOrganizeLinkedResults(results.statuses.get(chapterId)) &&
    results.isOrganizing({ workId, chapterId })
  )
    return "moving";
  return getLinkedResultIssue(results.statuses.get(chapterId));
}

export function countWorkResultProblems(
  results: LibraryResultActions | undefined,
  work: LibraryIndex["works"][number],
): number {
  return work.chapters.filter((chapter) => {
    const issue = resolveChapterResultIssue(results, work.id, chapter.id);
    return issue === "moveFailed" || issue === "syncFailed";
  }).length;
}

/** Viewing leads the chapter menu; the rare repair sits before delete. */
export function buildChapterResultMenuItems(
  results: LibraryResultActions | undefined,
  workId: string,
  chapter: LibraryChapterSummary,
  t: TFunction<"components">,
): { leading: MenuItem[]; repair: MenuItem[] } {
  const status = results?.statuses.get(chapter.id);
  if (!results || !status?.connectionId) return { leading: [], repair: [] };
  const view = buildViewLinkedResultsCommand(
    chapter.id,
    (chapterId) => void results.viewResults(chapterId),
    t,
    true,
  );
  const leading: MenuItem[] = [{ label: view.label, run: view.run }];
  if (status.organization?.preservedRootPaths?.length) {
    const previous = buildOpenPreviousLinkedResultsCommand(
      chapter.id,
      (chapterId) => void results.openPreviousFolder(chapterId),
      t,
      true,
    );
    leading.push({ label: previous.label, run: previous.run });
  }
  return {
    leading,
    repair: canOrganizeLinkedResults(status)
      ? [organizeItem(results, { workId, chapterId: chapter.id }, t)]
      : [],
  };
}

export function buildWorkResultMenuItems(
  results: LibraryResultActions | undefined,
  work: LibraryIndex["works"][number],
  t: TFunction<"components">,
): MenuItem[] {
  const organizable = work.chapters.some((chapter) =>
    canOrganizeLinkedResults(results?.statuses.get(chapter.id)),
  );
  return results && organizable
    ? [
        organizeItem(
          results,
          { workId: work.id },
          t,
          work.chapters.some(
            (chapter) =>
              canOrganizeLinkedResults(results.statuses.get(chapter.id)) &&
              results.statuses.get(chapter.id)?.organization?.state ===
                "moving",
          ),
        ),
      ]
    : [];
}

function organizeItem(
  results: LibraryResultActions,
  target: OrganizeLinkedResultsRequest,
  t: TFunction<"components">,
  relatedMoving = false,
): MenuItem {
  const command = buildOrganizeLinkedResultsCommand(
    target,
    (scope) => void results.organize(scope),
    t,
    true,
  );
  const moving =
    target.chapterId !== undefined &&
    results.statuses.get(target.chapterId)?.organization?.state === "moving";
  return {
    label: command.label,
    run: command.run,
    disabled: relatedMoving || moving || results.isOrganizing(target),
  };
}
