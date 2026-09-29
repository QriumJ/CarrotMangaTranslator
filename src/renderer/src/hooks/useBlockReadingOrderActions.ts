import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { offsetBlockBboxes } from "../../../shared/geometry";
import {
  inferPageBlockOrder,
  resolvePageBlockOrder,
} from "../../../shared/blockReadingOrder";
import { MAX_BLOCKS_PER_PAGE } from "../../../shared/ipcSchemaPrimitives";
import type { MangaPage } from "../../../shared/libraryTypes";
import type { TranslationBlock } from "../../../shared/textTypes";
import { normalizeTranslationBlockPatch } from "./useUpdateSelectedBlockAction";
import {
  instantiateBlockLibraryEntry,
  type BlockLibraryEntryV1,
} from "../../../shared/blockLibrary";
import type {
  BlockEditingActions,
  UseBlockEditingActionsOptions,
} from "./blockEditingActionTypes";

export function useMoveSelectedBlockInReadingOrderAction({
  readingDirection = "rtl",
  selectedBlock,
  selectedPage,
  selectedPageEditLocked,
  updateCurrentChapter,
}: UseBlockEditingActionsOptions): BlockEditingActions["moveSelectedBlockInReadingOrder"] {
  const { t } = useTranslation("renderer");
  return useCallback(
    (direction, blockId) => {
      const targetBlockId = blockId ?? selectedBlock?.id;
      if (!selectedPage || !targetBlockId || selectedPageEditLocked) return;
      const order = resolvePageBlockOrder(selectedPage, readingDirection);
      const index = order.indexOf(targetBlockId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= order.length) return;
      const currentId = order[index];
      const targetId = order[target];
      if (!currentId || !targetId) return;
      order[index] = targetId;
      order[target] = currentId;
      updateCurrentChapter(
        selectedPage.id,
        (current) => ({
          ...current,
          pages: current.pages.map((page) =>
            page.id === selectedPage.id
              ? {
                  ...page,
                  blockOrder: order,
                  updatedAt: new Date().toISOString(),
                }
              : page,
          ),
        }),
        { label: t("workspaceHistory.readingOrder") },
      );
    },
    [
      readingDirection,
      selectedBlock,
      selectedPage,
      selectedPageEditLocked,
      t,
      updateCurrentChapter,
    ],
  );
}

export function useSortPageReadingOrderAction({
  readingDirection = "rtl",
  selectedPage,
  selectedPageEditLocked,
  updateCurrentChapter,
}: UseBlockEditingActionsOptions): BlockEditingActions["sortPageReadingOrder"] {
  const { t } = useTranslation("renderer");
  return useCallback(() => {
    if (!selectedPage || selectedPageEditLocked) return;
    const order = inferPageBlockOrder(selectedPage.blocks, readingDirection);
    updateCurrentChapter(
      selectedPage.id,
      (current) => ({
        ...current,
        pages: current.pages.map((page) =>
          page.id === selectedPage.id
            ? {
                ...page,
                blockOrder: order,
                updatedAt: new Date().toISOString(),
              }
            : page,
        ),
      }),
      { label: t("workspaceHistory.readingOrder") },
    );
  }, [
    readingDirection,
    selectedPage,
    selectedPageEditLocked,
    t,
    updateCurrentChapter,
  ]);
}

export function useUpdateSelectedBlocksAction({
  selectedBlock,
  selectedBlockIds,
  selectedPage,
  selectedPageEditLocked,
  updateCurrentChapter,
}: UseBlockEditingActionsOptions): BlockEditingActions["updateSelectedBlocks"] {
  const { t } = useTranslation("renderer");
  return useCallback(
    (patch) => {
      if (!selectedPage || !selectedBlock || selectedPageEditLocked) return;
      const selectedIds = new Set(
        selectedBlockIds.length > 0 ? selectedBlockIds : [selectedBlock.id],
      );
      updateCurrentChapter(
        selectedPage.id,
        (current) => {
          let changed = false;
          const pages = current.pages.map((page) => {
            if (page.id !== selectedPage.id) return page;
            const blocks = page.blocks.map((block) => {
              if (!selectedIds.has(block.id)) return block;
              const next = normalizeTranslationBlockPatch(block, patch, {
                width: page.width,
                height: page.height,
              });
              changed ||= next !== block;
              return next;
            });
            return changed
              ? { ...page, blocks, updatedAt: new Date().toISOString() }
              : page;
          });
          return changed ? { ...current, pages } : current;
        },
        { label: t("workspaceHistory.blockEdit") },
      );
    },
    [
      selectedBlock,
      selectedBlockIds,
      selectedPage,
      selectedPageEditLocked,
      t,
      updateCurrentChapter,
    ],
  );
}

export function useDeleteSelectedBlockAction({
  selectedBlock,
  selectedBlockIds,
  selectedPage,
  selectedPageEditLocked,
  readingDirection = "rtl",
  setSelectedBlockId,
  setSelectedBlockIds,
  updateCurrentChapter,
}: UseBlockEditingActionsOptions): BlockEditingActions["deleteSelectedBlock"] {
  const { t } = useTranslation("renderer");
  return useCallback(() => {
    if (!selectedPage || !selectedBlock || selectedPageEditLocked) return;
    const selectedIds = new Set(
      selectedBlockIds.length > 0 ? selectedBlockIds : [selectedBlock.id],
    );
    const currentOrder = resolvePageBlockOrder(selectedPage, readingDirection);
    const firstSelectedIndex = currentOrder.findIndex((id) =>
      selectedIds.has(id),
    );
    const nextOrder = currentOrder.filter((id) => !selectedIds.has(id));
    const predecessor = findDeletionNeighbor(
      currentOrder,
      selectedIds,
      firstSelectedIndex,
    );
    updateCurrentChapter(
      selectedPage.id,
      (current) => ({
        ...current,
        pages: current.pages.map((page) =>
          page.id === selectedPage.id
            ? {
                ...page,
                updatedAt: new Date().toISOString(),
                blocks: page.blocks.filter(
                  (block) => !selectedIds.has(block.id),
                ),
                blockOrder: nextOrder,
              }
            : page,
        ),
      }),
      {
        label: t("workspaceHistory.deleteBlock"),
        selectionAfter: {
          selectedPageId: selectedPage.id,
          selectedBlockId: predecessor,
          selectedBlockIds: predecessor ? [predecessor] : [],
        },
      },
    );
    setSelectedBlockId(predecessor);
    setSelectedBlockIds(predecessor ? [predecessor] : []);
  }, [
    selectedBlock,
    selectedBlockIds,
    selectedPage,
    selectedPageEditLocked,
    readingDirection,
    setSelectedBlockId,
    setSelectedBlockIds,
    t,
    updateCurrentChapter,
  ]);
}

function findDeletionNeighbor(
  order: readonly string[],
  selectedIds: ReadonlySet<string>,
  firstSelectedIndex: number,
): string | null {
  for (let index = firstSelectedIndex - 1; index >= 0; index -= 1) {
    const id = order[index];
    if (id && !selectedIds.has(id)) return id;
  }
  for (
    let index = Math.max(0, firstSelectedIndex);
    index < order.length;
    index += 1
  ) {
    const id = order[index];
    if (id && !selectedIds.has(id)) return id;
  }
  return null;
}

export function useDuplicateSelectedBlockAction(
  options: UseBlockEditingActionsOptions,
): BlockEditingActions["duplicateSelectedBlock"] {
  const { t } = useTranslation("renderer");
  const { selectedBlock } = options;
  const insertBlock = useInsertPageBlockAction(options);
  return useCallback(() => {
    if (!selectedBlock) return;
    insertBlock(
      (page, id) => {
        const source = page.blocks.find(
          (block) => block.id === selectedBlock.id,
        );
        return source
          ? { ...offsetBlockBboxes(source, 16, 16, page), id }
          : null;
      },
      t("workspaceHistory.duplicateBlock"),
      selectedBlock.id,
    );
  }, [insertBlock, selectedBlock, t]);
}

export function useInsertBlockLibraryEntryAction(
  options: UseBlockEditingActionsOptions,
): BlockEditingActions["insertBlockLibraryEntry"] {
  const { t } = useTranslation("renderer");
  const { stageRef } = options;
  const insertBlock = useInsertPageBlockAction(options);
  return useCallback(
    (entry: BlockLibraryEntryV1) =>
      insertBlock(
        (page, id) =>
          instantiateBlockLibraryEntry(
            entry,
            id,
            resolveVisibleStageCenter(stageRef?.current ?? null),
            page,
          ),
        t("workspaceHistory.insertLibraryBlock"),
      ),
    [insertBlock, stageRef, t],
  );
}

function useInsertPageBlockAction({
  pushStatus,
  selectedPage,
  selectedPageEditLocked,
  readingDirection = "rtl",
  setSelectedBlockId,
  setSelectedBlockIds,
  updateCurrentChapter,
}: UseBlockEditingActionsOptions) {
  const { t } = useTranslation("renderer");
  return useCallback(
    (
      createBlock: (page: MangaPage, id: string) => TranslationBlock | null,
      label: string,
      afterBlockId?: string,
    ) => {
      if (!selectedPage || selectedPageEditLocked) return;
      const id = createLibraryBlockId(selectedPage.id);
      let inserted = false;
      updateCurrentChapter(
        selectedPage.id,
        (current) => {
          const page = current.pages.find(
            (page) => page.id === selectedPage.id,
          );
          if (!page) return current;
          if (page.blocks.length >= MAX_BLOCKS_PER_PAGE) {
            pushStatus(
              t("blockEditing.capacityReached", { count: MAX_BLOCKS_PER_PAGE }),
            );
            return current;
          }
          const block = createBlock(page, id);
          if (!block) return current;
          const blockOrder = resolvePageBlockOrder(page, readingDirection);
          const sourceIndex = blockOrder.indexOf(afterBlockId ?? "");
          blockOrder.splice(
            sourceIndex < 0 ? blockOrder.length : sourceIndex + 1,
            0,
            id,
          );
          inserted = true;
          const insertedPage = {
            ...page,
            blocks: [...page.blocks, block],
            blockOrder,
            updatedAt: new Date().toISOString(),
          };
          return {
            ...current,
            pages: current.pages.map((target) =>
              target === page ? insertedPage : target,
            ),
          };
        },
        {
          label,
          selectionAfter: {
            selectedPageId: selectedPage.id,
            selectedBlockId: id,
            selectedBlockIds: [id],
          },
        },
      );
      if (!inserted) return;
      setSelectedBlockId(id);
      setSelectedBlockIds([id]);
    },
    [
      pushStatus,
      selectedPage,
      selectedPageEditLocked,
      readingDirection,
      setSelectedBlockId,
      setSelectedBlockIds,
      t,
      updateCurrentChapter,
    ],
  );
}

export function resolveVisibleStageCenter(stage: HTMLElement | null): {
  x: number;
  y: number;
} {
  if (!stage) return { x: 500, y: 500 };
  const stageRect = stage.getBoundingClientRect();
  if (stageRect.width <= 0 || stageRect.height <= 0) {
    return { x: 500, y: 500 };
  }
  const viewport = stage.closest<HTMLElement>(".workspace");
  const viewportRect = viewport?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
    right: globalThis.innerWidth,
    bottom: globalThis.innerHeight,
  };
  const left = Math.max(stageRect.left, viewportRect.left);
  const right = Math.min(stageRect.right, viewportRect.right);
  const top = Math.max(stageRect.top, viewportRect.top);
  const bottom = Math.min(stageRect.bottom, viewportRect.bottom);
  if (right <= left || bottom <= top) return { x: 500, y: 500 };
  return {
    x: clampNormalized(
      (((left + right) / 2 - stageRect.left) / stageRect.width) * 1000,
    ),
    y: clampNormalized(
      (((top + bottom) / 2 - stageRect.top) / stageRect.height) * 1000,
    ),
  };
}

function clampNormalized(value: number): number {
  return Math.min(1000, Math.max(0, value));
}

function createLibraryBlockId(pageId: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
  const separator = "-library-";
  const prefixLength = Math.max(1, 200 - separator.length - suffix.length);
  return `${pageId.slice(0, prefixLength)}${separator}${suffix}`;
}
