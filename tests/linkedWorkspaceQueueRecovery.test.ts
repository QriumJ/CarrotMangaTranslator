import { afterEach, expect, it, vi } from "vitest";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeChapter } from "./fixtures/linkedWorkspace";
import {
  DEFAULT_RASTER_EXPORT_SETTINGS,
  type LinkedSyncQueueItemV1,
  type LinkedWorkspaceRegistryV1,
} from "../src/shared/linkedWorkspaceTypes";
import {
  createPageRevision,
  createPageVisualRevision,
} from "../src/shared/pageRevision";
import type { ChapterSnapshot, MangaPage } from "../src/shared/libraryTypes";
vi.mock("electron", () => ({
  app: { getVersion: () => "test" },
  shell: { openPath: async () => "" },
}));
import { LinkedWorkspaceSyncService } from "../src/main/linkedWorkspace/linkedWorkspaceSyncService";
import { connectImportedChapters } from "../src/main/ipc/linkedWorkspaceImport";
const roots: string[] = [];
const services: LinkedWorkspaceSyncService[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.dispose();
  vi.useRealTimers();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
function runtime(dataRoot: string, chapter: ChapterSnapshot) {
  const reportError = vi.fn();
  const renderPage = vi.fn(async (snapshot: MangaPage) =>
    Buffer.from(snapshot.blocks[0]?.translatedText ?? ""),
  );
  const library = {
    workOrder: [chapter.workId],
    works: [
      {
        id: chapter.workId,
        title: "test",
        chapterOrder: [chapter.id],
        chapters: [{ ...chapter, pageCount: chapter.pages.length }],
        createdAt: chapter.createdAt,
        updatedAt: chapter.updatedAt,
      },
    ],
  };
  const create = () => {
    const service = new LinkedWorkspaceSyncService({
      dataRoot,
      jobs: { hasActive: false } as never,
      decodeImage: async () => null,
      getMainWindow: () => null,
      reportError,
      dependencies: {
        listLibrary: async () => library,
        openChapter: async () => structuredClone(chapter),
        updatePagesAfterInpainting: vi.fn(),
        createPageExportRenderSession: async () => ({
          renderPage,
          close: () => {},
          cancel: () => {},
        }),
      },
    });
    services.push(service);
    return service;
  };
  return { reportError, renderPage, library, create };
}
async function fixture(custom = false) {
  if (custom) vi.useRealTimers();
  else vi.useFakeTimers();
  const dataRoot = await mkdtemp(join(tmpdir(), "linked-queue-recovery-"));
  roots.push(dataRoot);
  const chapter = makeChapter();
  const page = chapter.pages[0];
  if (!page) throw new Error("missing page");
  page.imagePath = join(dataRoot, "001.png");
  await writeFile(page.imagePath, "source");
  const { reportError, renderPage, library, create } = runtime(
    dataRoot,
    chapter,
  );
  const service = create();
  await service.initialize();
  const customRoot = join(dataRoot, "custom");
  if (custom) await mkdir(customRoot);
  const status = await service.connect({
    workId: chapter.workId,
    chapterId: chapter.id,
    ...(custom ? { rootPath: customRoot } : {}),
    output: DEFAULT_RASTER_EXPORT_SETTINGS,
    enqueueExistingPages: false,
  });
  const queueItem = (): LinkedSyncQueueItemV1 => ({
    connectionId: status.connectionId ?? "",
    chapterId: chapter.id,
    pageId: page.id,
    visualRevision: createPageVisualRevision(page),
    mirrorRevision: createPageRevision(page),
    attempts: 4,
    nextRetryAt: Number.MAX_SAFE_INTEGER,
    priority: 6,
    queuedAt: Date.now(),
  });
  const edit = (text: string) => {
    const block = page.blocks[0];
    if (!block) throw new Error("missing block");
    block.translatedText = text;
  };
  const restart = async (item: LinkedSyncQueueItemV1) => {
    await service.dispose();
    await writeFile(
      join(dataRoot, "linked-sync-queue.json"),
      JSON.stringify({ schemaVersion: 1, items: [item] }),
    );
    const next = create();
    await next.initialize();
    return next;
  };
  return {
    dataRoot,
    chapter,
    page,
    service,
    renderPage,
    reportError,
    queueItem,
    edit,
    restart,
    library,
    create,
  };
}
async function drain(service: LinkedWorkspaceSyncService) {
  await vi.advanceTimersByTimeAsync(3_000);
  const active = Reflect.get(service, "activeDrainPromise");
  if (active) await active;
}
it("drops an obsolete failed item when the current version and artifacts are already published", async () => {
  const f = await fixture();
  const obsolete = f.queueItem();
  f.edit("latest");
  await f.service.notifyPagesSaved(f.chapter.id, [f.page.id]);
  await drain(f.service);
  expect(f.renderPage).toHaveBeenCalledTimes(1);
  const next = await f.restart(obsolete);
  expect(next.getStatus(f.chapter.id)).toMatchObject({
    state: "idle",
    pendingCount: 0,
    failedCount: 0,
  });
  const queue = JSON.parse(
    await readFile(join(f.dataRoot, "linked-sync-queue.json"), "utf8"),
  );
  expect(queue.items).toEqual([]);
  expect(f.renderPage).toHaveBeenCalledTimes(1);
});
it("replaces an obsolete terminal failure with the unpublished current revision on restart", async () => {
  const f = await fixture();
  f.edit("first published version");
  await f.service.notifyPagesSaved(f.chapter.id, [f.page.id]);
  await drain(f.service);
  const obsolete = f.queueItem();
  f.edit("new unsynced version");
  const next = await f.restart(obsolete);
  expect(next.getStatus(f.chapter.id).failedCount).toBe(0);
  await drain(next);
  expect(f.renderPage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      blocks: [
        expect.objectContaining({ translatedText: "new unsynced version" }),
      ],
    }),
    expect.anything(),
  );
  expect(next.getStatus(f.chapter.id).pendingCount).toBe(0);
});
it("refreshes a version changed before capture without recording a save failure", async () => {
  const f = await fixture();
  await f.service.notifyPagesSaved(f.chapter.id, [f.page.id]);
  f.edit("edited before capture");
  await drain(f.service);
  await drain(f.service);
  expect(f.reportError).not.toHaveBeenCalled();
  expect(f.renderPage).toHaveBeenCalledTimes(1);
  expect(f.service.getStatus(f.chapter.id)).toMatchObject({
    state: "idle",
    pendingCount: 0,
    failedCount: 0,
  });
});
it("keeps a real failure on the same revision and reports its cause", async () => {
  const f = await fixture();
  f.edit("version that fails to render");
  f.renderPage.mockRejectedValue(new Error("disk or renderer failure"));
  await f.service.notifyPagesSaved(f.chapter.id, [f.page.id]);
  await drain(f.service);
  expect(f.reportError).toHaveBeenCalledWith(
    "Linked workspace page sync failed",
    expect.objectContaining({
      chapterId: f.chapter.id,
      pageId: f.page.id,
      error: expect.any(Error),
    }),
  );
  const next = await f.restart(f.queueItem());
  expect(next.getStatus(f.chapter.id).failedCount).toBe(1);
  await drain(next);
  expect(f.renderPage).toHaveBeenCalledTimes(1);
});

it("preserves a failed first image export when only its metadata mirror was published", async () => {
  const f = await fixture();
  await drain(f.service);
  expect(f.renderPage).not.toHaveBeenCalled();
  const next = await f.restart(f.queueItem());
  expect(next.getStatus(f.chapter.id)).toMatchObject({
    state: "failed",
    failedCount: 1,
    pendingCount: 1,
  });
  await drain(next);
  expect(f.renderPage).not.toHaveBeenCalled();
});

it("disconnects deleted chapters on restart without deleting their existing output files", async () => {
  const f = await fixture();
  f.edit("preserved output");
  await f.service.notifyPagesSaved(f.chapter.id, [f.page.id]);
  await drain(f.service);
  const root = f.service.getStatus(f.chapter.id).rootPath;
  if (!root) throw new Error("missing output root");
  const resultPath = join(root, "result", "001.png");
  const before = await readFile(resultPath);
  const obsolete = f.queueItem();
  f.library.works = [];
  f.library.workOrder = [];
  const next = await f.restart(obsolete);
  expect(next.listStatuses()).toEqual([]);
  expect(await readFile(resultPath)).toEqual(before);
  const queue = JSON.parse(
    await readFile(join(f.dataRoot, "linked-sync-queue.json"), "utf8"),
  );
  expect(queue.items).toEqual([]);
});

it.each(["update", "restart", "save", "disabled"] as const)(
  "keeps the destination and existing files when inserting a same-stem page via %s",
  async (mode) => {
    vi.useRealTimers();
    const { dataRoot, service, page, chapter, create } = await fixture(true);
    const root = service.getStatus(chapter.id).rootPath;
    if (!root) throw new Error("missing destination");
    const ONE_PIXEL_PNG = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    let active = service;
    const registryPath = join(dataRoot, "linked-workspaces.json");
    const readRecord = async () => {
      const registry: LinkedWorkspaceRegistryV1 = JSON.parse(
        await readFile(registryPath, "utf8"),
      );
      return registry.records[0];
    };
    try {
      await service.viewResults({ chapterId: chapter.id });
      const before = await readRecord();
      const oldSource = await readFile(
        join(root, before.sourceRelativePaths?.[page.id] ?? ""),
      );
      const oldResult = await readFile(
        join(root, before.resultRelativePaths?.[page.id] ?? ""),
      );
      if (mode === "disabled")
        await service.update({ connectionId: before.id, enabled: false });
      const added: MangaPage = {
        ...structuredClone(page),
        id: "44444444-4444-4444-8444-444444444444",
        name: "001.jpg",
        sourceFileName: "001.jpg",
        sourceRelativePath: "001.jpg",
        imagePath: join(dataRoot, "added.png"),
      };
      await writeFile(added.imagePath, ONE_PIXEL_PNG);
      chapter.pages.unshift(added);
      chapter.pageOrder.unshift(added.id);
      if (mode === "restart") {
        await active.dispose();
        active = create();
        await active.initialize();
      } else if (mode === "save") {
        await active.notifyPagesSaved(chapter.id, [added.id]);
      } else {
        expect(
          await connectImportedChapters(
            { linkedWorkspaceSync: active },
            {
              previewId: "added-pages",
              target: {
                mode: "chapter",
                workId: chapter.workId,
                chapterId: chapter.id,
                position: { kind: "end" },
              },
              selections: [],
            },
            {
              workId: chapter.workId,
              chapterIds: [chapter.id],
              addedPageIds: [added.id],
            },
          ),
        ).toEqual({});
      }
      const updated = await readRecord();
      expect(updated).toMatchObject({
        rootPath: root,
        destinationKind: "custom",
        enabled: mode !== "disabled",
        output: before.output,
      });
      expect(updated.sourceRelativePaths?.[page.id]).toBe(
        before.sourceRelativePaths?.[page.id],
      );
      expect(updated.resultRelativePaths?.[page.id]).toBe(
        before.resultRelativePaths?.[page.id],
      );
      expect(
        await readFile(
          join(root, updated.sourceRelativePaths?.[added.id] ?? ""),
        ),
      ).toEqual(ONE_PIXEL_PNG);
      expect(
        await readFile(
          join(root, updated.sourceRelativePaths?.[page.id] ?? ""),
        ),
      ).toEqual(oldSource);
      expect(
        await readFile(
          join(root, updated.resultRelativePaths?.[page.id] ?? ""),
        ),
      ).toEqual(oldResult);
      if (mode === "disabled")
        await active.update({ connectionId: before.id, enabled: true });
      await expect(
        active.viewResults({ chapterId: chapter.id }),
      ).resolves.toMatchObject({ status: "opened" });
      expect(await readdir(join(root, "result"))).toHaveLength(2);
      await active.dispose();
      active = create();
      await active.initialize();
      expect(active.getStatus(chapter.id)).toMatchObject({
        rootPath: root,
        destinationKind: "custom",
      });
      expect((await readRecord()).sourceRelativePaths).toEqual(
        updated.sourceRelativePaths,
      );
    } finally {
      await active.dispose();
    }
  },
);
