import { randomUUID } from "node:crypto";
import { ok } from "node:assert";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { retentionFixture } from "./mcpRetention.fixture";

it("migrates a v1 catalog beyond 4096 essential records to encrypted pages without changing their identities", async () => {
  const f = await retentionFixture();
  try {
    await f.edit("old profile");
    const index = await f.storage.index();
    const original = index.entries[0];
    const oldRecord = await readFile(await f.storage.path(original.id));
    for (let i = 0; i < 4200; i++)
      index.entries.push({
        ...original,
        id: randomUUID(),
        kind: "context",
        pageCount: 0,
      });
    const path = await f.storage.path();
    await writeFile(path, JSON.stringify(await f.codec.seal(index)));
    await f.restart();
    await f.edit("first save on migrated catalog");
    const manifest = (await f.codec.open(
      JSON.parse(await readFile(path, "utf8")),
    )) as { version: number; generation: string; pageCount: number };
    expect(manifest).toMatchObject({ version: 2, pageCount: 17 });
    const pages = await readdir(
      join(dirname(path), `catalog-${manifest.generation}`),
    );
    expect(pages).toHaveLength(17);
    for (const file of pages) {
      const raw = await readFile(
        join(dirname(path), `catalog-${manifest.generation}`, file),
        "utf8",
      );
      expect(raw).not.toContain(original.owner);
      const page = (await f.codec.open(JSON.parse(raw))) as {
        entries: unknown[];
      };
      expect(page.entries.length).toBeLessThanOrEqual(256);
    }
    await f.restart();
    expect(
      (await f.storage.index()).entries.slice(0, index.entries.length),
    ).toEqual(index.entries);
    expect(await readFile(await f.storage.path(original.id))).toEqual(
      oldRecord,
    );
    const latest = (await f.list()).items.find(
      (entry) => entry.id !== original.id,
    );
    ok(latest);
    await f.recover(latest.id, "undo");
    expect((await f.snapshot()).pages[0].blocks[0].translatedText).toBe(
      "old profile",
    );
  } finally {
    await f.close();
  }
});

it("rejects a missing, corrupt or mismatched catalog page without changing saved content", async () => {
  const f = await retentionFixture();
  try {
    await f.edit("catalog evidence");
    const path = await f.storage.path();
    const rootBytes = await readFile(path);
    const root = (await f.codec.open(JSON.parse(rootBytes.toString()))) as {
      generation: string;
    };
    const pagePath = join(
      dirname(path),
      `catalog-${root.generation}`,
      "0.json",
    );
    const pageBytes = await readFile(pagePath);
    const page = (await f.codec.open(
      JSON.parse(pageBytes.toString()),
    )) as Record<string, unknown>;
    const saved = await readFile(f.chapterPath);
    for (const invalid of [
      "invalid encrypted page",
      JSON.stringify(await f.codec.seal({ ...page, generation: randomUUID() })),
      JSON.stringify(await f.codec.seal({ ...page, page: 1 })),
      JSON.stringify(await f.codec.seal({ ...page, entries: [] })),
    ]) {
      await writeFile(pagePath, invalid);
      await expect(
        f.edit("must not overwrite corrupt catalog"),
      ).rejects.toThrow();
      expect(await readFile(f.chapterPath)).toEqual(saved);
      expect(await readFile(path)).toEqual(rootBytes);
    }
    await writeFile(pagePath, pageBytes);
    expect((await f.list()).total).toBe(1);
  } finally {
    await f.close();
  }
});

it("keeps profile-wide active records through expiry and releases observers when the session closes", async () => {
  const f = await retentionFixture();
  let release = () => {};
  try {
    await f.edit("active in another connection");
    const index = await f.storage.index();
    const id = index.entries[0].id;
    index.entries[0].expiresAt = 1;
    await writeFile(
      await f.storage.path(),
      JSON.stringify(await f.codec.seal(index)),
    );
    const { McpRetentionStorage } =
      await import("../src/main/mcp/mcpRetentionStorage");
    const session = new McpRetentionStorage(
      f.codec,
      Date.now,
      (candidate) => candidate === id,
    );
    release = session.observeActivity();
    const bytes = await readFile(await session.path(id));
    await f.edit("another connection cannot prune an active record");
    expect(await readFile(await session.path(id))).toEqual(bytes);
    release();
    await f.edit("settled record can now expire");
    expect(
      (await f.storage.index()).entries.some((entry) => entry.id === id),
    ).toBe(false);
  } finally {
    release();
    await f.close();
  }
});

it("expires reclaimed receipts in bounded batches without requiring their retired payload directories", async () => {
  const f = await retentionFixture();
  try {
    await f.edit("receipt source");
    const index = await f.storage.index();
    for (let i = 0; i < 200; i++)
      index.entries.push({
        ...index.entries[0],
        id: randomUUID(),
        expiresAt: 1,
        bytes: 0,
        reclaimedAt: 1,
      });
    await writeFile(
      await f.storage.path(),
      JSON.stringify(await f.codec.seal(index)),
    );
    await f.edit("first expiry pass");
    expect(
      (await f.storage.index()).entries.filter(
        (entry) => entry.reclaimedAt !== undefined,
      ),
    ).toHaveLength(72);
    await f.edit("next expiry pass");
    expect(
      (await f.storage.index()).entries.some(
        (entry) => entry.reclaimedAt !== undefined,
      ),
    ).toBe(false);
  } finally {
    await f.close();
  }
});
