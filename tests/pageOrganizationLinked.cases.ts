import { it, expect, vi } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { makeChapter } from "./fixtures/linkedWorkspace";
import { buildLinkedMirrorFileName } from "../src/main/linkedWorkspace/linkedWorkspacePaths";
import type { ChapterSnapshot, MangaPage } from "../src/shared/libraryTypes";
import type { LinkedWorkspaceSyncService } from "../src/main/linkedWorkspace/linkedWorkspaceSyncService";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
type Fixture = {
  boundary: {
    chapter: ChapterSnapshot | null;
    sessions: { renderPage: { mock: { calls: unknown[][] } } }[];
  };
  makeConnectedService: (
    mode: "managed",
  ) => Promise<{ root: string; service: LinkedWorkspaceSyncService }>;
  requirePage: () => MangaPage;
  requireChapter: () => ChapterSnapshot;
};
export function registerPageOrganizationLinkedCases({
  boundary,
  makeConnectedService,
  requirePage,
  requireChapter,
}: Fixture) {
  it("publishes renamed output without removing earlier results and updates recovery metadata", async () => {
    vi.useRealTimers();
    boundary.chapter = makeChapter(2);
    const { root, service } = await makeConnectedService("managed");
    try {
      await service.viewResults({ chapterId: CHAPTER_ID });
      const old = await readFile(join(root, "result", "001.png"));
      const page = requirePage();
      page.outputBaseName = "표지";
      page.name = "표지.png";
      requireChapter().pages.reverse();
      requireChapter().pageOrder.reverse();
      await service.validatePageOrganization(requireChapter());
      await service.notifyPagesSaved(CHAPTER_ID, requireChapter().pageOrder, {
        organizationChanged: true,
      });
      await service.viewResults({ chapterId: CHAPTER_ID });
      expect(await readFile(join(root, "result", "001.png"))).toEqual(old);
      expect(
        (await readFile(join(root, "result", "표지.png"))).length,
      ).toBeGreaterThan(0);
      const mirror = JSON.parse(
        await readFile(join(root, buildLinkedMirrorFileName(root)), "utf8"),
      );
      expect(mirror.chapters[0].pages.map((p: MangaPage) => p.id)).toEqual(
        requireChapter().pageOrder,
      );
      expect(mirror.chapters[0].pages[1]).toMatchObject({
        name: "표지.png",
        outputBaseName: "표지",
        sourceRelativePath: "originals/001.png",
      });
      await writeFile(join(root, "result", "occupied.png"), "user file");
      page.outputBaseName = "occupied";
      await expect(
        service.validatePageOrganization(requireChapter()),
      ).rejects.toThrow("기존 출력");
      expect(await readFile(join(root, "result", "occupied.png"), "utf8")).toBe(
        "user file",
      );
    } finally {
      await service.dispose();
    }
  });

  it("publishes an order-only change in the recovery mirror without rerendering", async () => {
    vi.useRealTimers();
    boundary.chapter = makeChapter(2);
    const { root, service } = await makeConnectedService("managed");
    try {
      await service.viewResults({ chapterId: CHAPTER_ID });
      const rendered = boundary.sessions.flatMap(
        (s) => s.renderPage.mock.calls,
      ).length;
      requireChapter().pages.reverse();
      requireChapter().pageOrder.reverse();
      await service.notifyPagesSaved(CHAPTER_ID, requireChapter().pageOrder, {
        organizationChanged: true,
        immediate: true,
      });
      await service.viewResults({ chapterId: CHAPTER_ID });
      const mirror = JSON.parse(
        await readFile(join(root, buildLinkedMirrorFileName(root)), "utf8"),
      );
      expect(mirror.chapters[0].pages.map((p: MangaPage) => p.id)).toEqual(
        requireChapter().pageOrder,
      );
      expect(
        boundary.sessions.flatMap((s) => s.renderPage.mock.calls).length,
      ).toBe(rendered);
    } finally {
      await service.dispose();
    }
  });
}
