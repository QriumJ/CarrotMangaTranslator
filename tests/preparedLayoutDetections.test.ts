import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreparedLayoutDetections } from "../src/main/bubbleLayout/preparedLayoutDetections";
import type { ComicPageDetectionResult } from "../src/main/bubbleLayout/contracts";
import { makePage } from "./unifiedInpaintingUiFixtures";

const roots: string[] = [];
const stores: PreparedLayoutDetections[] = [];
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.dispose()));
  await Promise.all(
    roots.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

async function fixture(count = 1) {
  const root = await mkdtemp(join(tmpdir(), "layout-store-test-"));
  roots.push(root);
  const store = new PreparedLayoutDetections();
  stores.push(store);
  const pages = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const imagePath = join(root, `${i}.png`);
      await writeFile(imagePath, `source ${i}`);
      return { ...makePage(), id: `page-${i}`, imagePath };
    }),
  );
  return { store, pages, signal: new AbortController().signal };
}

function detection(
  logits = new Float32Array([-1.25, 0, 1 / 3, 8]),
): ComicPageDetectionResult {
  return {
    imageWidth: 2,
    imageHeight: 2,
    executionProvider: "dml",
    detections: [
      {
        labelId: 2,
        label: "bubble",
        box: [0, 0, 2, 2],
        score: 0.9,
        mask: { logits, width: 2, height: 2 },
      },
    ],
  };
}

describe("prepared layout GPU phase boundary", () => {
  it("spills 160 pages once and preserves exact mask floats beyond the old cache limits", async () => {
    const { store, pages, signal } = await fixture(160);
    const expected = detection(new Float32Array(17 * 1024 * 1024).fill(1 / 3));
    const detect = vi.fn(async (page) =>
      page === pages[0] ? expected : detection(),
    );
    const release = vi.fn(async () => {});
    const progress = vi.fn();
    await store.prepare(
      [...pages, pages[0]],
      signal,
      detect,
      release,
      progress,
    );
    expect(progress).toHaveBeenLastCalledWith(pages[0], 160);
    expect(detect).toHaveBeenCalledTimes(160);
    expect(release).toHaveBeenCalledOnce();
    const restored = await store.read(pages[0].imagePath);
    const restoredLogits = restored.detections[0].mask?.logits;
    const expectedLogits = expected.detections[0].mask?.logits;
    if (!restoredLogits || !expectedLogits)
      throw new Error("mask logits missing");
    expect(restoredLogits).toBeInstanceOf(Float32Array);
    expect(
      Buffer.from(
        restoredLogits.buffer,
        restoredLogits.byteOffset,
        restoredLogits.byteLength,
      ).equals(Buffer.from(expectedLogits.buffer)),
    ).toBe(true);
    expect(await store.read(pages[159].imagePath)).toEqual(detection());
    expect(detect).toHaveBeenCalledTimes(160);
  });

  it("does not become readable until asynchronous GPU release completes", async () => {
    const { store, pages, signal } = await fixture();
    let finish!: () => void;
    let entered!: () => void;
    const releasing = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const released = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const prepared = store.prepare(
      pages,
      signal,
      async () => detection(),
      async () => {
        entered();
        await released;
      },
    );
    await releasing;
    await expect(
      store.prepare(
        pages,
        signal,
        async () => detection(),
        async () => {},
      ),
    ).rejects.toThrow("이미 진행 중");
    await expect(store.read(pages[0].imagePath)).rejects.toMatchObject({
      nonRetriable: true,
    });
    finish();
    await prepared;
    expect(await store.read(pages[0].imagePath)).toEqual(detection());
  });

  it.each(["cancel", "detect", "release", "changed-during-detection"])(
    "fails closed on %s without retrying detection",
    async (failure) => {
      const { store, pages } = await fixture(2);
      const abort = new AbortController();
      const detect = vi.fn(async () => {
        if (failure === "cancel") abort.abort();
        if (failure === "detect") throw new Error("detection failed");
        if (failure === "changed-during-detection")
          await writeFile(pages[0].imagePath, "modified original");
        return detection();
      });
      const release = vi.fn(async () => {
        if (failure === "release") throw new Error("release failed");
      });
      await expect(
        store.prepare(pages, abort.signal, detect, release),
      ).rejects.toThrow();
      expect(detect).toHaveBeenCalledTimes(failure === "release" ? 2 : 1);
      expect(release).toHaveBeenCalledOnce();
      await expect(store.read(pages[0].imagePath)).rejects.toMatchObject({
        nonRetriable: true,
      });
    },
  );

  it("rejects stale originals and removes only its own generated spill directory", async () => {
    const { store, pages, signal } = await fixture();
    await store.prepare(
      pages,
      signal,
      async () => detection(),
      async () => {},
    );
    await writeFile(pages[0].imagePath, "changed original");
    await expect(store.read(pages[0].imagePath)).rejects.toMatchObject({
      nonRetriable: true,
    });
    await store.dispose();
    await expect(store.read(pages[0].imagePath)).rejects.toMatchObject({
      nonRetriable: true,
    });
    await expect(readdir(join(pages[0].imagePath, ".."))).resolves.toEqual([
      "0.png",
    ]);
  });
});
