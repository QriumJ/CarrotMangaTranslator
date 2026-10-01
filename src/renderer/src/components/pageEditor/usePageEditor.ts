import React from "react";
import type { ChapterSnapshot } from "../../../../shared/libraryTypes";
import {
  pageNameParts,
  pageOrganizationRevision,
  pageOutputNameError,
  type EditPageOrganizationRequest,
} from "../../../../shared/pageOrganization";
import {
  applyPageRangeSelection,
  togglePageSelection,
} from "../../lib/pageSelection";
import { usePageRangeAnchor } from "../usePageRangeAnchor";
import {
  movePageGroup,
  parsePageRange,
  sortPageSlots,
} from "../../lib/pageEditorOrder";
import { runPageRename } from "../../lib/runPageRename";
import type { PageRenameRule } from "../../lib/pageEditorRename";
import { findPageOutputNameConflicts } from "../../../../shared/pageOutputNaming";

type Draft = { order: string[]; names: Record<string, string> };
export function usePageEditor(chapter: ChapterSnapshot, work: string) {
  const initial = React.useMemo(
    () => ({
      order: [...chapter.pageOrder],
      names: Object.fromEntries(
        chapter.pages.map((p) => [p.id, pageNameParts(p.name).base]),
      ),
    }),
    [chapter],
  );
  const history = useDraftHistory(initial);
  const { draft, commit } = history;
  const [scope, setScope] = React.useState<"all" | "selected">("all");
  const [error, setError] = React.useState("");
  const pagesById = React.useMemo(
    () => new Map(chapter.pages.map((p) => [p.id, p])),
    [chapter],
  );
  const pages = draft.order.flatMap((id) => {
    const page = pagesById.get(id);
    return page ? [page] : [];
  });
  const selection = useEditorSelection(chapter.id, pages);
  const { selected, select, anchor } = selection;
  const targets = scope === "all" ? new Set(draft.order) : selected;
  const naming = useEditorNaming(
    draft,
    targets,
    { work, chapter: chapter.title },
    commit,
    setError,
  );
  const validation = validateDraft(draft, initial, pages);
  return {
    ...history,
    ...naming,
    ...validation,
    draft,
    initial,
    pages,
    selected,
    targets,
    scope,
    setScope,
    error,
    setError,
    select,
    undo: () => {
      history.undo();
      anchor.reset();
    },
    redo: () => {
      history.redo();
      anchor.reset();
    },
    edit: (id: string, value: string) =>
      commit({ ...draft, names: { ...draft.names, [id]: value } }, id),
    finishEdit: history.endGroup,
    toggle: (id: string, shift: boolean) =>
      (shift ? anchor.toggleRange : anchor.togglePage)(chapter.id, id, pages),
    move: (target: Parameters<typeof movePageGroup>[2], group = selected) => {
      anchor.reset();
      commit({ ...draft, order: movePageGroup(draft.order, group, target) });
    },
    range: (text: string) => selectRange(text, draft.order, select, setError),
    sort: (mode: "asc" | "desc" | "reverse", original: boolean) => {
      anchor.reset();
      commit({
        ...draft,
        order: sortPageSlots(
          draft.order,
          targets,
          original ? initial.names : draft.names,
          mode,
        ),
      });
    },
    request: () => buildRequest(chapter, draft, validation.changedIds),
  };
}

function useDraftHistory(initial: Draft) {
  const [draft, setDraft] = React.useState(initial);
  const [past, setPast] = React.useState<Draft[]>([]);
  const [future, setFuture] = React.useState<Draft[]>([]);
  const group = React.useRef<string | undefined>(undefined);
  return {
    draft,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    endGroup: () => {
      group.current = undefined;
    },
    commit: (next: Draft, key?: string) => {
      if (JSON.stringify(next) === JSON.stringify(draft)) return;
      if (!key || group.current !== key) setPast([...past, draft]);
      group.current = key;
      setFuture([]);
      setDraft(next);
    },
    undo: () => {
      group.current = undefined;
      const previous = past.at(-1);
      if (!previous) return;
      setFuture([draft, ...future]);
      setPast(past.slice(0, -1));
      setDraft(previous);
    },
    redo: () => {
      group.current = undefined;
      const next = future[0];
      if (!next) return;
      setPast([...past, draft]);
      setFuture(future.slice(1));
      setDraft(next);
    },
  };
}

function useEditorSelection(
  chapterId: string,
  pages: ChapterSnapshot["pages"],
) {
  const [selected, setSelected] = React.useState(new Set<string>());
  const selectionMap = () =>
    new Map([[chapterId, { kind: "pages" as const, pageIds: selected }]]);
  const options = {
    selectAll: {
      kind: "pages" as const,
      pageIds: new Set(pages.map((p) => p.id)),
    },
  };
  const anchor = usePageRangeAnchor(
    (_, id) =>
      setSelected(
        togglePageSelection(selectionMap(), chapterId, id, pages, options).get(
          chapterId,
        )?.pageIds ?? new Set(),
      ),
    (_, from, to) =>
      setSelected(
        applyPageRangeSelection(
          selectionMap(),
          chapterId,
          from,
          to,
          pages,
          options,
        ).get(chapterId)?.pageIds ?? new Set(),
      ),
  );
  return {
    selected,
    anchor,
    select: (ids: Set<string>) => {
      anchor.reset();
      setSelected(ids);
    },
  };
}

function useEditorNaming(
  draft: Draft,
  targets: ReadonlySet<string>,
  context: { work: string; chapter: string },
  commit: (next: Draft) => void,
  setError: (error: string) => void,
) {
  const [working, setWorking] = React.useState(false);
  return {
    working,
    rename: async (rule: PageRenameRule) => {
      const ids = draft.order.filter((id) => targets.has(id));
      if (!ids.length) {
        setError("selection");
        return;
      }
      setWorking(true);
      setError("");
      try {
        const values = await runPageRename(
          ids.map((id) => draft.names[id]),
          rule,
          context,
        );
        commit({
          ...draft,
          names: {
            ...draft.names,
            ...Object.fromEntries(ids.map((id, i) => [id, values[i]])),
          },
        });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "rename");
      } finally {
        setWorking(false);
      }
    },
  };
}

function validateDraft(
  draft: Draft,
  initial: Draft,
  pages: ChapterSnapshot["pages"],
) {
  const rowErrors: Record<string, string> = {};
  const changedIds = draft.order.filter(
    (id) => draft.names[id] !== initial.names[id],
  );
  for (const id of changedIds) {
    const issue = pageOutputNameError(draft.names[id]);
    if (issue) rowErrors[id] = issue;
  }
  const conflicts = findPageOutputNameConflicts(
    pages.map((page) => ({
      ...page,
      outputBaseName:
        draft.names[page.id] !== initial.names[page.id]
          ? draft.names[page.id]
          : page.outputBaseName,
    })),
  );
  for (const id of conflicts) rowErrors[id] ??= "duplicate";
  const orderChanges = draft.order.filter(
    (id, i) => initial.order[i] !== id,
  ).length;
  return {
    rowErrors,
    changedIds,
    nameChanges: changedIds.length,
    orderChanges,
    changed: changedIds.length > 0 || orderChanges > 0,
  };
}
export type PageEditorModel = ReturnType<typeof usePageEditor>;

function selectRange(
  text: string,
  order: string[],
  select: (ids: Set<string>) => void,
  setError: (error: string) => void,
): void {
  try {
    select(parsePageRange(text, order));
    setError("");
  } catch (cause) {
    setError(cause instanceof Error ? cause.message : "range");
  }
}

function buildRequest(
  chapter: ChapterSnapshot,
  draft: Draft,
  changedIds: string[],
): EditPageOrganizationRequest {
  return {
    chapterId: chapter.id,
    revision: pageOrganizationRevision(chapter),
    pageIds: draft.order,
    names: changedIds.map((pageId) => ({
      pageId,
      baseName: draft.names[pageId],
    })),
  };
}
