import { useEffect, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type {
  ImportPreviewResult,
  ImportTarget,
} from "../../../shared/importTypes";
import type {
  ChapterSnapshot,
  LibraryIndex,
  LibraryWorkSummary,
} from "../../../shared/libraryTypes";
import type { ImportModalSubmit } from "../lib/importFlowTypes";
import { libraryGateway } from "../api/libraryGateway";
import { formatErrorMessage } from "../lib/errorPresentation";
import {
  buildImportSubmitPayload,
  isImportSubmittable,
  resolveImportModalInitialState,
} from "./importModalHelpers";

type PageTarget = Extract<ImportTarget, { mode: "chapter" }>;
type ImportMode = "chapters" | "pages";
type ImportModalStateOptions = {
  library: LibraryIndex;
  currentWorkId: string | null;
  currentChapterId: string | null;
  addPagesChapter: ChapterSnapshot | null;
  preview: ImportPreviewResult;
  initialDraft: ImportModalSubmit | null;
};

export function useImportModalState(options: ImportModalStateOptions) {
  const { t } = useTranslation("renderer");
  const { library, initialDraft, addPagesChapter } = options;
  const chapterState = useChapterImportState(options);
  const { selections } = chapterState;
  const [mode, setMode] = useState<ImportMode>(() =>
    initialDraft
      ? initialDraft.target.mode === "chapter"
        ? "pages"
        : "chapters"
      : addPagesChapter
        ? "pages"
        : "chapters",
  );
  const [pageTarget, setPageTarget] = useState(() =>
    initialPageTarget(options),
  );
  const [translateAddedPages, setTranslateAddedPages] = useState(
    initialDraft?.translateAddedPages ?? false,
  );
  const work = library.works.find(
    (candidate) => candidate.id === pageTarget.workId,
  );
  const chapterAvailable = Boolean(
    work?.chapters.some((chapter) => chapter.id === pageTarget.chapterId),
  );
  const loaded = useImportChapter(
    mode === "pages" && chapterAvailable,
    pageTarget,
    addPagesChapter,
    t,
  );
  const { position } = pageTarget;
  const submittable =
    mode === "pages"
      ? Boolean(
          loaded.chapter &&
          selections.some((selection) => selection.enabled) &&
          (position.kind === "end" ||
            loaded.chapter.pages.some((page) => page.id === position.pageId)),
        )
      : chapterState.submittable;
  const submitPayload: ImportModalSubmit =
    mode === "pages"
      ? { target: pageTarget, selections, translateAddedPages }
      : chapterState.submitPayload;
  return {
    ...chapterState,
    mode,
    setMode,
    pageTarget,
    setPageTarget,
    translateAddedPages,
    setTranslateAddedPages,
    work,
    chapterAvailable,
    ...loaded,
    submittable,
    submitPayload,
  };
}

function useChapterImportState({
  library,
  currentWorkId,
  preview,
  initialDraft,
}: ImportModalStateOptions) {
  const initial = resolveImportModalInitialState(
    library,
    currentWorkId,
    preview,
    initialDraft,
  );
  const [targetMode, setTargetMode] = useState(initial.targetMode);
  const [newWorkTitle, setNewWorkTitle] = useState(initial.newWorkTitle);
  const [existingWorkId, setExistingWorkId] = useState(initial.existingWorkId);
  const [selections, setSelections] = useState(initial.selections);
  const [linkedWorkspace, setLinkedWorkspace] = useState(
    initial.linkedWorkspace,
  );
  return {
    targetMode,
    setTargetMode,
    newWorkTitle,
    setNewWorkTitle,
    existingWorkId,
    setExistingWorkId,
    selections,
    setSelections,
    linkedWorkspace,
    setLinkedWorkspace,
    currentWorkId: initial.currentWorkId,
    submittable: isImportSubmittable(
      targetMode,
      newWorkTitle,
      existingWorkId,
      selections,
    ),
    submitPayload: buildImportSubmitPayload(
      targetMode,
      newWorkTitle,
      existingWorkId,
      selections,
      linkedWorkspace,
    ),
  };
}

function initialPageTarget({
  library,
  currentWorkId,
  currentChapterId,
  addPagesChapter,
  initialDraft,
}: ImportModalStateOptions): PageTarget {
  if (initialDraft?.target.mode === "chapter") return initialDraft.target;
  if (addPagesChapter)
    return {
      mode: "chapter",
      workId: addPagesChapter.workId,
      chapterId: addPagesChapter.id,
      position: { kind: "end" },
    };
  const work =
    library.works.find(
      (candidate) =>
        candidate.id === currentWorkId && candidate.chapters.length > 0,
    ) ?? library.works.find((candidate) => candidate.chapters.length > 0);
  return {
    mode: "chapter",
    workId: work?.id ?? "",
    chapterId: initialChapterId(work, currentChapterId),
    position: { kind: "end" },
  };
}

function initialChapterId(
  work: LibraryWorkSummary | undefined,
  currentChapterId: string | null,
): string {
  if (!work) return "";
  if (
    currentChapterId &&
    work.chapters.some((chapter) => chapter.id === currentChapterId)
  )
    return currentChapterId;
  return (
    work.chapterOrder.find((id) =>
      work.chapters.some((chapter) => chapter.id === id),
    ) ??
    work.chapters[0]?.id ??
    ""
  );
}

function useImportChapter(
  enabled: boolean,
  target: PageTarget,
  knownChapter: ChapterSnapshot | null,
  t: TFunction<"renderer">,
) {
  const [result, setResult] = useState<{
    chapterId: string;
    chapter?: ChapterSnapshot;
    error?: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { workId, chapterId } = target;
  const known =
    knownChapter?.id === chapterId && knownChapter.workId === workId
      ? knownChapter
      : null;
  useEffect(() => {
    if (!enabled || known) return;
    let active = true;
    setResult(null);
    void libraryGateway
      .openChapter(chapterId)
      .then((chapter) => {
        if (chapter.id !== chapterId || chapter.workId !== workId)
          throw new Error(t("library.openChapterFailed"));
        if (active) setResult({ chapterId, chapter });
      })
      .catch((error: unknown) => {
        if (active)
          setResult({
            chapterId,
            error: formatErrorMessage(error, t("library.openChapterFailed")),
          });
      });
    return () => {
      active = false;
    };
  }, [enabled, known, chapterId, workId, attempt, t]);
  const matching = result?.chapterId === chapterId ? result : null;
  return {
    chapter: enabled ? (known ?? matching?.chapter ?? null) : null,
    loadError: matching?.error ?? null,
    retryLoad: () => {
      setResult(null);
      setAttempt((value) => value + 1);
    },
  };
}
