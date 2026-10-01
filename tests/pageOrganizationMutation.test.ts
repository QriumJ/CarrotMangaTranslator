import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { pageOrganizationFixture } from "./mcpLibraryPageOrder.fixture";
import { pageOrganizationRevision } from "../src/shared/pageOrganization";

it("commits names and order with memory reconciliation and preserves source bytes", async () => {
  const f = await pageOrganizationFixture();
  try {
    const { editPageOrganization } =
      await import("../src/main/library/pageOrganizationFacade");
    await f.writeMemory();
    const before = await Promise.all(
      f.chapter.pages.map((p) => readFile(p.imagePath)),
    );
    const pageId = f.chapter.pageOrder[0];
    const next = await editPageOrganization({
      chapterId: f.chapter.id,
      revision: pageOrganizationRevision(f.chapter),
      pageIds: [...f.chapter.pageOrder].reverse(),
      names: [{ pageId, baseName: "새 이름" }],
    });
    const renamed = next.pages.find((p) => p.id === pageId);
    if (!renamed) throw new Error("missing renamed page");
    await f.restart();
    expect(renamed.outputBaseName).toBe("새 이름");
    expect(renamed.imagePath).toBe(f.chapter.pages[0].imagePath);
    expect(next.pageOrder).toEqual([...f.chapter.pageOrder].reverse());
    expect(
      (await f.readMemory()).pages.find((p) => p.pageId === pageId),
    ).toMatchObject({
      pageIndex: 1,
      pageName: renamed.name,
      summary: f.memory.pages[0].summary,
    });
    expect(
      await Promise.all(f.chapter.pages.map((p) => readFile(p.imagePath))),
    ).toEqual(before);
    expect(
      (await f.library.openChapter(f.chapter.id)).pages.find(
        (p) => p.id === pageId,
      )?.outputBaseName,
    ).toBe("새 이름");
    await expect(
      editPageOrganization({
        chapterId: f.chapter.id,
        revision: pageOrganizationRevision(f.chapter),
        pageIds: f.chapter.pageOrder,
        names: [],
      }),
    ).rejects.toThrow("변경");
  } finally {
    await f.close();
  }
});

it("rejects stale inventories, duplicate names and output failures atomically", async () => {
  const f = await pageOrganizationFixture();
  try {
    const { editPageOrganization } =
      await import("../src/main/library/pageOrganizationFacade");
    const request = {
      chapterId: f.chapter.id,
      revision: pageOrganizationRevision(f.chapter),
      pageIds: f.chapter.pageOrder,
      names: f.chapter.pages.map((p) => ({ pageId: p.id, baseName: "same" })),
    };
    const before = await readFile(f.chapterPath);
    await expect(editPageOrganization(request)).rejects.toThrow("Output name");
    await expect(
      editPageOrganization({
        ...request,
        names: [],
        pageIds: [request.pageIds[0]],
      }),
    ).rejects.toThrow("목록");
    await expect(
      editPageOrganization(
        { ...request, names: [request.names[0]] },
        async () => {
          throw new Error("output conflict");
        },
      ),
    ).rejects.toThrow("output conflict");
    expect(await readFile(f.chapterPath)).toEqual(before);
  } finally {
    await f.close();
  }
});
