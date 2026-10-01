import { usePageOrganizationAction } from "./usePageOrganizationAction";
import type {
  ApplyChapterAction,
  LibraryReorderActions,
  UseLibraryActionsOptions,
} from "./libraryActionTypes";
import { useReorderChaptersAction } from "./useReorderChaptersAction";
import { useReorderPagesAction } from "./useReorderPagesAction";

type LibraryReorderActionsOptions = UseLibraryActionsOptions & {
  applyChapter: ApplyChapterAction;
  refreshLibrary: () => Promise<void>;
};

export function useLibraryReorderActions(
  options: LibraryReorderActionsOptions,
): LibraryReorderActions {
  const editor = usePageOrganizationAction(options);
  return {
    ...editor,
    reorderChapterInLibrary: useReorderChaptersAction(options),
    reorderPageInChapter: useReorderPagesAction(options),
  };
}
