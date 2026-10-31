import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { importDuplicateFixture } from "./mcpImportDuplicate.fixture";

it("preserves native title normalization, unique chapter names and partial reorder behavior", async () => {
  const f = await importDuplicateFixture();
  const { installLinkedWorkspaceSaveNotifier } =
    await import("../src/main/linkedWorkspace/linkedWorkspaceNotifications");
  const renamed = vi.fn(async () => undefined);
  const uninstall = installLinkedWorkspaceSaveNotifier(
    async () => undefined,
    () => undefined,
    renamed,
  );
  try {
    const first = await f.create(await f.command(await f.prepare()));
    const append = await f.command(await f.prepare());
    append.target = await f.target(first.workId);
    const second = await f.create(append);
    const a = await f.library.openChapter(first.chapterIds[0]);
    const b = await f.library.openChapter(second.chapterIds[0]);
    const images = await Promise.all(
      a.pages.map((page) => readFile(page.imagePath)),
    );
    await f.library.renameWork(first.workId, "  이름 日本語 <script> 😀  ");
    await f.library.renameChapter(b.id, "새 화");
    await f.library.renameChapter(b.id, `  ${a.title}  `);
    await vi.waitFor(() => expect(renamed).toHaveBeenCalledTimes(3));
    expect(renamed.mock.calls).toEqual([
      [{ workId: first.workId }],
      [{ workId: first.workId, chapterId: b.id }],
      [{ workId: first.workId, chapterId: b.id }],
    ]);
    await f.library.reorderChapters(first.workId, [b.id]);
    const work = (await f.library.listLibrary()).works.find(
      (item) => item.id === first.workId,
    );
    expect(work?.title).toBe("이름 日本語 <script> 😀");
    expect(work?.chapters.map((item) => item.id)).toEqual([b.id, a.id]);
    const after = await f.library.openChapter(b.id);
    expect(after.title).toBe(`${a.title} (1)`);
    expect(after.pages).toEqual(b.pages);
    expect(after.importSource).toEqual(b.importSource);
    expect(
      await Promise.all(a.pages.map((page) => readFile(page.imagePath))),
    ).toEqual(images);
    expect((await f.library.openChapter(a.id)).pages).toEqual(a.pages);
  } finally {
    uninstall();
    await f.close();
  }
});

it.each(["work", "chapter"] as const)(
  "allows a native %s rename to keep result folders, without changing the legacy default",
  async (kind) => {
    const f = await importDuplicateFixture();
    const { installLinkedWorkspaceSaveNotifier } =
      await import("../src/main/linkedWorkspace/linkedWorkspaceNotifications");
    const renamed = vi.fn(async () => undefined);
    const uninstall = installLinkedWorkspaceSaveNotifier(
      async () => undefined,
      () => undefined,
      renamed,
    );
    try {
      const first = await f.create(await f.command(await f.prepare()));
      const chapterId = first.chapterIds[0];
      const before = await f.library.openChapter(chapterId);
      const output = join(f.env.root, "results", "kept-title", "result");
      await mkdir(output, { recursive: true });
      const userFile = join(output, "user-edited.png");
      await writeFile(userFile, "user-owned result");
      const rename = (title: string, moveResultFolders?: boolean) =>
        kind === "work"
          ? f.library.renameWork(first.workId, title, moveResultFolders)
          : f.library.renameChapter(chapterId, title, moveResultFolders);
      const changed = await rename("title only", false);
      const work = changed.works.find((item) => item.id === first.workId);
      expect(kind === "work" ? work?.title : work?.chapters[0].title).toBe(
        "title only",
      );
      // The notifier defers work with a zero-delay timer after the native lock releases.
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(renamed).not.toHaveBeenCalled();
      expect(await readFile(userFile, "utf8")).toBe("user-owned result");
      expect((await f.library.openChapter(chapterId)).pages).toEqual(
        before.pages,
      );

      await rename("move explicitly", true);
      await vi.waitFor(() => expect(renamed).toHaveBeenCalledTimes(1));
      if (kind === "work")
        await f.library.renameWork(first.workId, "legacy rename");
      else await f.library.renameChapter(chapterId, "legacy rename");
      await vi.waitFor(() => expect(renamed).toHaveBeenCalledTimes(2));
      const target =
        kind === "work"
          ? { workId: first.workId }
          : { workId: first.workId, chapterId };
      expect(renamed.mock.calls).toEqual([[target], [target]]);
      expect(await readFile(userFile, "utf8")).toBe("user-owned result");
    } finally {
      uninstall();
      await f.close();
    }
  },
);
