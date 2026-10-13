import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makePngImage } from "./helpers/imageFixtures";
import { prepareFoldersImportPreview } from "../src/main/libraryStore/importFoldersPreview";
vi.mock("electron", () => ({
  app: { isPackaged: false },
  nativeImage: {
    createFromPath: () => ({ getSize: () => ({ width: 0, height: 0 }) }),
  },
}));
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "multi-folder-import-"));
  roots.push(root);
  return root;
}
async function image(directory: string, filename = "0001.png") {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, filename), makePngImage(2, 3));
}
describe("multi-folder native import preview", () => {
  it("includes root images, removes duplicate/descendant selections and preserves chapter prefixes", async () => {
    const root = await fixture();
    const folder = join(root, "26");
    await image(folder);
    await image(join(folder, "27"));
    const { preview, cleanup } = await prepareFoldersImportPreview([
      folder,
      folder,
      join(folder, "27"),
    ]);
    expect(preview.chapters.map((c) => c.title)).toEqual(["26", "27"]);
    expect(
      preview.chapters.flatMap((c) =>
        c.pages.map((p) => p.sourceRelativePath?.replaceAll("\\", "/")),
      ),
    ).toEqual(["26/0001.png", "27/0001.png"]);
    await cleanup?.();
  });
  it("assigns deterministic distinct aliases for roots with identical basenames", async () => {
    const root = await fixture();
    const left = join(root, "a", "26");
    const right = join(root, "b", "26");
    await image(left);
    await image(right);
    const result = await prepareFoldersImportPreview([right, left]);
    expect(
      result.preview.chapters.flatMap((c) =>
        c.pages.map((p) => p.sourceRelativePath?.replaceAll("\\", "/")),
      ),
    ).toEqual(["26/0001.png", "26 (2)/0001.png"]);
    expect(result.preview.chapters[0].pages[0].sourcePath).toBe(
      await realpath(join(left, "0001.png")),
    );
    await result.cleanup?.();
  });
  it("keeps a valid root when another root contains only invalid images", async () => {
    const root = await fixture();
    const good = join(root, "good");
    const bad = join(root, "bad");
    await image(good);
    await mkdir(join(bad, "broken"), { recursive: true });
    await writeFile(join(bad, "broken", "bad.png"), "broken");
    const result = await prepareFoldersImportPreview([bad, good]);
    expect(result.preview.chapters).toHaveLength(1);
    expect(result.preview.excludedPages).toHaveLength(1);
    await result.cleanup?.();
    await expect(prepareFoldersImportPreview([bad])).rejects.toThrow(/bad.png/);
  });
  it("rejects empty selections, files and cancelled work", async () => {
    const root = await fixture();
    await image(root);
    await expect(prepareFoldersImportPreview([])).rejects.toThrow();
    await expect(
      prepareFoldersImportPreview([join(root, "0001.png")]),
    ).rejects.toThrow(/ordinary source folders/);
    await expect(
      prepareFoldersImportPreview([root], AbortSignal.abort()),
    ).rejects.toThrow();
  });
});
