import React from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type {
  ChapterSnapshot,
  LibraryIndex,
} from "../../../shared/libraryTypes";
import type {
  LinkedWorkspaceStatus,
  OrganizeLinkedResultsRequest,
  OrganizeLinkedResultsResult,
  ViewLinkedResultsResult,
} from "../../../shared/linkedWorkspaceTypes";
import { linkedWorkspaceGateway } from "../api/linkedWorkspaceGateway";
import { formatErrorMessage } from "../lib/errorPresentation";
import { toast } from "../lib/toastStore";
import { canOrganizeLinkedResults } from "../lib/linkedResultsCommands";
import { useLinkedWorkspaceStatuses } from "./useLinkedWorkspaceStatuses";

const ALL_SCOPE = "all";
const scopeKey = (target?: OrganizeLinkedResultsRequest): string =>
  !target
    ? ALL_SCOPE
    : target.chapterId
      ? `chapter:${target.chapterId}`
      : `work:${target.workId}`;

export type LinkedResultsController = {
  /** Current chapter status, kept for the output area. */
  status: LinkedWorkspaceStatus | null;
  statuses: ReadonlyMap<string, LinkedWorkspaceStatus>;
  viewBusy: boolean;
  viewResults: (chapterId?: string) => Promise<void>;
  openPreviousFolder: (chapterId?: string) => Promise<void>;
  organize: (target?: OrganizeLinkedResultsRequest) => Promise<void>;
  /** True when an affected managed chapter overlaps this scope. */
  isOrganizing: (target?: OrganizeLinkedResultsRequest) => boolean;
};

type ControllerArgs = {
  currentChapter: ChapterSnapshot | null;
  currentPageId: string | null;
  library: LibraryIndex;
  pushStatus: (line: string) => void;
  saveNow: () => Promise<void>;
};

export function useLinkedWorkspaceController({
  currentChapter,
  currentPageId,
  library,
  pushStatus,
  saveNow,
}: ControllerArgs): LinkedResultsController {
  const { t } = useTranslation("components");
  const currentChapterId = currentChapter?.id ?? null;
  const chapterIds = React.useMemo(
    () => library.works.flatMap((work) => work.chapterOrder),
    [library.works],
  );
  const { refresh, statuses } = useLinkedWorkspaceStatuses(chapterIds);
  const reportFailure = React.useCallback(
    (message: string) => {
      pushStatus(message);
      toast.error(message);
    },
    [pushStatus],
  );
  const openers = useResultFolderOpeners(
    {
      currentChapterId,
      currentPageId,
      reportFailure,
      saveNow,
    },
    t,
  );
  const organizer = useScopedOrganizer(
    {
      library,
      statuses,
      refresh,
      reportFailure,
    },
    t,
  );
  return {
    status: currentChapterId ? (statuses.get(currentChapterId) ?? null) : null,
    statuses,
    ...openers,
    ...organizer,
  };
}

function useResultFolderOpeners(
  {
    currentChapterId,
    currentPageId,
    reportFailure,
    saveNow,
  }: Pick<ControllerArgs, "currentPageId" | "saveNow"> & {
    currentChapterId: string | null;
    reportFailure: (message: string) => void;
  },
  t: TFunction<"components">,
) {
  const [viewBusy, setViewBusy] = React.useState(false);
  const open = React.useCallback(
    async (request: () => Promise<ViewLinkedResultsResult>) => {
      try {
        const result = await request();
        if (result.status === "failed") reportFailure(result.message);
      } catch (error) {
        reportFailure(formatErrorMessage(error, t("linkedResults.openFailed")));
      }
    },
    [reportFailure, t],
  );
  const viewResults = React.useCallback(
    async (chapterId = currentChapterId ?? undefined): Promise<void> => {
      if (!chapterId) return;
      if (chapterId !== currentChapterId) {
        await open(() =>
          linkedWorkspaceGateway.viewLinkedResults({ chapterId }),
        );
        return;
      }
      if (viewBusy) return;
      setViewBusy(true);
      await open(async () => {
        await saveNow();
        return linkedWorkspaceGateway.viewLinkedResults({
          chapterId,
          ...(currentPageId ? { currentPageId } : {}),
        });
      });
      setViewBusy(false);
    },
    [currentChapterId, currentPageId, open, saveNow, viewBusy],
  );
  const openPreviousFolder = React.useCallback(
    async (chapterId = currentChapterId ?? undefined): Promise<void> => {
      if (chapterId)
        await open(() =>
          linkedWorkspaceGateway.openPreservedLinkedResults({ chapterId }),
        );
    },
    [currentChapterId, open],
  );
  return { viewBusy, viewResults, openPreviousFolder };
}

function useScopedOrganizer(
  {
    library,
    statuses,
    refresh,
    reportFailure,
  }: {
    library: LibraryIndex;
    statuses: ReadonlyMap<string, LinkedWorkspaceStatus>;
    refresh: () => Promise<void>;
    reportFailure: (message: string) => void;
  },
  t: TFunction<"components">,
) {
  const running = React.useRef(new Map<string, ReadonlySet<string>>());
  const [busyScopes, setBusyScopes] = React.useState<
    ReadonlyMap<string, ReadonlySet<string>>
  >(() => new Map());
  const affectedChapters = React.useCallback(
    (target?: OrganizeLinkedResultsRequest) =>
      library.works
        .filter((work) => !target || work.id === target.workId)
        .flatMap((work) => work.chapterOrder)
        .filter(
          (id) =>
            (!target?.chapterId || id === target.chapterId) &&
            canOrganizeLinkedResults(statuses.get(id)),
        ),
    [library.works, statuses],
  );
  const overlaps = React.useCallback(
    (
      chapters: readonly string[],
      scopes: ReadonlyMap<string, ReadonlySet<string>>,
    ) =>
      chapters.some(
        (id) =>
          statuses.get(id)?.organization?.state === "moving" ||
          [...scopes.values()].some((ids) => ids.has(id)),
      ),
    [statuses],
  );
  const organize = React.useCallback(
    async (target?: OrganizeLinkedResultsRequest): Promise<void> => {
      const key = scopeKey(target);
      const chapters = affectedChapters(target);
      if (chapters.length === 0 || overlaps(chapters, running.current)) return;
      running.current.set(key, new Set(chapters));
      setBusyScopes(new Map(running.current));
      try {
        showOrganizeResult(
          t,
          await linkedWorkspaceGateway.organizeLinkedResults(target),
        );
      } catch (error) {
        reportFailure(
          formatErrorMessage(error, t("linkedResults.organizeFailed")),
        );
      } finally {
        running.current.delete(key);
        setBusyScopes(new Map(running.current));
        await refresh().catch((error: unknown) => {
          reportFailure(
            formatErrorMessage(error, t("linkedResults.refreshFailed")),
          );
        });
      }
    },
    [affectedChapters, overlaps, refresh, reportFailure, t],
  );
  const isOrganizing = React.useCallback(
    (target?: OrganizeLinkedResultsRequest) =>
      overlaps(affectedChapters(target), busyScopes),
    [affectedChapters, busyScopes, overlaps],
  );
  return { organize, isOrganizing };
}

/** Rows keep failure reasons; the toast only summarizes a finished run. */
function showOrganizeResult(
  t: TFunction<"components">,
  { failures, moved }: OrganizeLinkedResultsResult,
): void {
  if (failures.length > 0) {
    toast.warn(t("linkedResults.organizePartial", { count: failures.length }));
  } else if (moved > 0) {
    toast.success(t("linkedResults.organizeDone", { count: moved }));
  } else {
    toast.info(t("linkedResults.organizeUpToDate"));
  }
}
