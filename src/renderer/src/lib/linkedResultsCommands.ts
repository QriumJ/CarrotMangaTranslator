import type { TFunction } from "i18next";
import type {
  LinkedWorkspaceStatus,
  OrganizeLinkedResultsRequest,
} from "../../../shared/linkedWorkspaceTypes";
import type { ChapterSnapshot } from "../../../shared/libraryTypes";
import type { AppCommand } from "./appCommandTypes";

/** One visible result-folder problem per chapter, most urgent first. */
export type LinkedResultIssue =
  "moving" | "moveFailed" | "syncFailed" | "preserved";

export function getLinkedResultIssue(
  status: LinkedWorkspaceStatus | null | undefined,
): LinkedResultIssue | null {
  if (!status?.connectionId) return null;
  if (status.organization?.state === "moving") return "moving";
  if (status.organization?.state === "failed") return "moveFailed";
  if (status.state === "failed") return "syncFailed";
  if (status.organization?.preservedRootPaths?.length) return "preserved";
  return null;
}

export function canOrganizeLinkedResults(
  status: LinkedWorkspaceStatus | null | undefined,
): boolean {
  return Boolean(
    status?.connectionId && (status.destinationKind ?? "managed") === "managed",
  );
}

/** Bound "view results" shared by the output area, chapter menus and palette. */
export function buildViewLinkedResultsCommand(
  chapterId: string | null,
  view: ((chapterId: string) => void) | undefined,
  t: TFunction<"components">,
  available: boolean,
): AppCommand<"view-linked-results"> {
  return {
    id: "view-linked-results",
    label: t("inpainting.export.viewResults"),
    paletteVisible: Boolean(chapterId && view && available),
    run: () => {
      if (chapterId) view?.(chapterId);
    },
  };
}

export function buildOpenPreviousLinkedResultsCommand(
  chapterId: string | null,
  open: ((chapterId: string) => void) | undefined,
  t: TFunction<"components">,
  available: boolean,
): AppCommand<"open-previous-linked-results"> {
  return {
    id: "open-previous-linked-results",
    label: t("linkedResults.openPrevious"),
    paletteVisible: Boolean(chapterId && open && available),
    run: () => {
      if (chapterId && available) open?.(chapterId);
    },
  };
}

/** Bound folder-name repair for exactly one work or chapter. */
export function buildOrganizeLinkedResultsCommand(
  target: OrganizeLinkedResultsRequest | null,
  organize: ((target: OrganizeLinkedResultsRequest) => void) | undefined,
  t: TFunction<"components">,
  available: boolean,
): AppCommand<"organize-linked-results"> {
  return {
    id: "organize-linked-results",
    label: t("linkedResults.organize"),
    paletteVisible: Boolean(target && organize && available),
    run: () => {
      if (target && available) organize?.(target);
    },
  };
}

/** The result-folder owner the shared commands bind to. */
export type LinkedResultsCommandSource = {
  status: LinkedWorkspaceStatus | null;
  statuses: ReadonlyMap<string, LinkedWorkspaceStatus>;
  viewResults: (chapterId?: string) => Promise<void>;
  openPreviousFolder: (chapterId?: string) => Promise<void>;
  organize: (target?: OrganizeLinkedResultsRequest) => Promise<void>;
  isOrganizing: (target?: OrganizeLinkedResultsRequest) => boolean;
};

/** Current-chapter and all-scope commands for the registry and palette. */
export function buildLinkedResultsCommands(
  currentChapter: Pick<ChapterSnapshot, "id" | "workId"> | null,
  source: LinkedResultsCommandSource | undefined,
  t: TFunction<"components">,
): {
  [
    Id in
      | "view-linked-results"
      | "open-previous-linked-results"
      | "organize-linked-results"
      | "organize-all-linked-results"
  ]: AppCommand<Id>;
} {
  const status = source?.status;
  const chapterId = currentChapter?.id ?? null;
  const organize = source?.organize;
  const target = currentChapter
    ? { workId: currentChapter.workId, chapterId: currentChapter.id }
    : null;
  return {
    "view-linked-results": buildViewLinkedResultsCommand(
      chapterId,
      source?.viewResults,
      t,
      Boolean(status?.connectionId),
    ),
    "open-previous-linked-results": buildOpenPreviousLinkedResultsCommand(
      chapterId,
      source?.openPreviousFolder,
      t,
      hasPreservedLinkedResults(status),
    ),
    "organize-linked-results": buildOrganizeLinkedResultsCommand(
      target,
      organize,
      t,
      canOrganizeCurrentScope(source, target),
    ),
    "organize-all-linked-results": buildOrganizeAllLinkedResultsCommand(
      organize,
      t,
      canOrganizeAllScopes(source),
    ),
  };
}

function hasPreservedLinkedResults(
  status: LinkedWorkspaceStatus | null | undefined,
): boolean {
  return Boolean(
    status?.connectionId && status.organization?.preservedRootPaths?.length,
  );
}

function canOrganizeCurrentScope(
  source: LinkedResultsCommandSource | undefined,
  target: OrganizeLinkedResultsRequest | null,
): boolean {
  return Boolean(
    source &&
    target &&
    canOrganizeLinkedResults(source.status) &&
    !source.isOrganizing(target),
  );
}

function canOrganizeAllScopes(
  source: LinkedResultsCommandSource | undefined,
): boolean {
  return Boolean(
    source &&
    !source.isOrganizing() &&
    [...source.statuses.values()].some(canOrganizeLinkedResults),
  );
}

function buildOrganizeAllLinkedResultsCommand(
  organize: (() => void) | undefined,
  t: TFunction<"components">,
  available: boolean,
): AppCommand<"organize-all-linked-results"> {
  return {
    id: "organize-all-linked-results",
    label: t("linkedResults.organizeAll"),
    paletteVisible: Boolean(organize && available),
    run: () => {
      if (available) organize?.();
    },
  };
}
