import { randomUUID } from "node:crypto";
import { ok } from "node:assert";
import { readFile, writeFile, access } from "node:fs/promises";
import { expect, it, vi } from "vitest";
import { retentionFixture } from "./mcpRetention.fixture";
import { createPageRevision } from "../src/shared/pageRevision";
import {
  MCP_RETENTION_CAPACITY,
  MCP_RETENTION_BYTES,
} from "../src/main/mcp/mcpRetentionRecords";

it("keeps existing pages and records intact when encryption becomes unavailable", async () => {
  const f = await retentionFixture();
  try {
    await f.edit("saved while encryption available");
    const page = await readFile(f.chapterPath);
    const index = await readFile(await f.storage.path());
    const available = vi
      .spyOn(f.encryption, "available")
      .mockReturnValue(false);
    await expect(f.edit("must not save plaintext")).rejects.toThrow();
    expect(await readFile(f.chapterPath)).toEqual(page);
    expect(await readFile(await f.storage.path())).toEqual(index);
    available.mockRestore();
    expect((await f.list()).total).toBe(1);
  } finally {
    await f.close();
  }
});

it("preserves original save history after a renderer notification failure and avoids no-op records", async () => {
  const f = await retentionFixture();
  try {
    const original = (await f.snapshot()).pages[0].blocks[0].translatedText;
    await f.edit(original);
    expect((await f.list()).total).toBe(0);
    f.editing.notifySaved.mockImplementationOnce(() => {
      throw new Error("synthetic notification failure");
    });
    await expect(f.edit("committed before notification")).rejects.toThrow();
    const id = (await f.list()).items[0].id;
    await f.restart();
    await f.recover(id, "undo");
    expect((await f.snapshot()).pages[0].blocks[0].translatedText).toBe(
      original,
    );
  } finally {
    await f.close();
  }
});

it("revokes a pending save even after encrypted staging started and creates no historical record", async () => {
  const f = await retentionFixture();
  try {
    const before = await readFile(f.chapterPath);
    let authorized = true;
    const caller = f.auth();
    const guard = () => {
      if (!authorized) throw new Error("grant revoked");
    };
    caller.assertAuthorized.mockImplementation(guard);
    caller.assertJobAuthorized.mockImplementation(guard);
    const encrypt = f.encryption.encrypt;
    const hook = vi
      .spyOn(f.encryption, "encrypt")
      .mockImplementation((text) => {
        if (text.includes('"domain":"carrot-retention-v1"')) authorized = false;
        return encrypt(text);
      });
    const page = (await f.snapshot()).pages[0];
    await expect(
      f.invoke(
        "carrot_update_page_blocks",
        {
          chapterId: "chapter",
          pageId: page.id,
          revision: createPageRevision(page),
          edits: [
            {
              blockId: page.blocks[0].id,
              fields: { translatedText: "revoked pending edit" },
            },
          ],
        },
        caller,
      ),
    ).rejects.toThrow();
    hook.mockRestore();
    expect(await readFile(f.chapterPath)).toEqual(before);
    expect((await f.list()).total).toBe(0);
  } finally {
    await f.close();
  }
});

it("expires records without touching current images and prunes only expired store-owned copies on the next commit", async () => {
  const f = await retentionFixture();
  try {
    await f.paint();
    const page = (await f.snapshot()).pages[0];
    if (!page.inpaintedImagePath) throw new Error("Expected painted image");
    const image = await readFile(page.inpaintedImagePath);
    const index = await f.storage.index();
    const expired = index.entries[0].id;
    index.entries[0].expiresAt = 1;
    await writeFile(
      await f.storage.path(),
      JSON.stringify(await f.codec.seal(index)),
    );
    expect((await f.list()).items[0].available).toBe(false);
    expect(await f.inspect(expired)).toMatchObject({
      state: "expired",
      canUndo: false,
    });
    await f.edit("next unrelated text commit");
    expect((await f.list()).total).toBe(1);
    await expect(access(await f.storage.path(expired))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(page.inpaintedImagePath)).toEqual(image);
  } finally {
    await f.close();
  }
});

it("rotates eligible history at 4096 entries and retains identity without deleting unknown records", async () => {
  const f = await retentionFixture();
  try {
    await f.edit("kept history");
    const index = await f.storage.index();
    const first = index.entries[0];
    index.entries = Array.from({ length: MCP_RETENTION_CAPACITY }, (_, i) => ({
      ...first,
      id: i ? randomUUID() : first.id,
      owner: i ? "different-owner" : first.owner,
      createdAt: first.createdAt + i,
    }));
    await writeFile(
      await f.storage.path(),
      JSON.stringify(await f.codec.seal(index)),
    );
    await f.edit("new save succeeds at capacity");
    const next = await f.storage.index();
    expect(next.entries).toHaveLength(MCP_RETENTION_CAPACITY + 1);
    expect(next.entries[0]).toMatchObject({
      id: first.id,
      bytes: 0,
      reclaimedAt: expect.any(Number),
    });
    expect(next.entries.slice(1, MCP_RETENTION_CAPACITY)).toEqual(
      index.entries.slice(1),
    );
    await expect(access(await f.storage.path(first.id))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await f.inspect(first.id)).toMatchObject({
      state: "reclaimed",
      canUndo: false,
    });
    const latest = (await f.list()).items.find((item) => item.id !== first.id);
    ok(latest);
    await f.restart();
    await f.recover(latest.id, "undo");
    expect((await f.snapshot()).pages[0].blocks[0].translatedText).toBe(
      "kept history",
    );
  } finally {
    await f.close();
  }
});

it("continues from an existing 256-record profile without evicting history and can undo after restart", async () => {
  const f = await retentionFixture();
  try {
    const original = (await f.snapshot()).pages[0].blocks[0].translatedText;
    await f.edit("old history");
    const index = await f.storage.index();
    const first = index.entries[0];
    index.entries = Array.from({ length: 256 }, (_, i) => ({
      ...first,
      id: i ? randomUUID() : first.id,
      owner: i ? "different-owner" : first.owner,
    }));
    await writeFile(
      await f.storage.path(),
      JSON.stringify(await f.codec.seal(index)),
    );
    await f.restart();
    await f.edit("new chapter edit");
    expect((await f.storage.index()).entries.slice(0, 256)).toEqual(
      index.entries,
    );
    expect((await f.storage.index()).entries).toHaveLength(257);
    const latest = (await f.list()).items.find((item) => item.id !== first.id);
    if (!latest) throw new Error("Missing new recovery record");
    await f.restart();
    await f.recover(latest.id, "undo");
    expect((await f.snapshot()).pages[0].blocks[0].translatedText).toBe(
      "old history",
    );
    await f.recover(first.id, "undo");
    expect((await f.snapshot()).pages[0].blocks[0].translatedText).toBe(
      original,
    );
  } finally {
    await f.close();
  }
});

it("saves image work at the old byte limit and keeps the newest change recoverable after restart", async () => {
  const f = await retentionFixture();
  try {
    await f.edit("kept image source");
    const index = await f.storage.index();
    index.entries[0].bytes = MCP_RETENTION_BYTES;
    await writeFile(
      await f.storage.path(),
      JSON.stringify(await f.codec.seal(index)),
    );
    const before = (await f.snapshot()).pages[0];
    const result = await f.paint();
    expect(result.status).toBe("completed");
    const history = await f.list();
    expect(
      history.items.find((item) => item.id === index.entries[0].id)?.state,
    ).toBe("reclaimed");
    const latest = history.items.find((item) => item.state === "retained");
    ok(latest);
    await f.storage.assertCanAdd();
    await f.restart();
    await f.recover(latest.id, "undo");
    expect((await f.snapshot()).pages[0].inpaintedImagePath).toBe(
      before.inpaintedImagePath,
    );
    await f.recover(latest.id, "redo");
    expect((await f.snapshot()).pages[0].inpaintedImagePath).toBeTruthy();
  } finally {
    await f.close();
  }
});

it("rejects inconsistent pagination instead of merging snapshots from different commits", async () => {
  const f = await retentionFixture();
  try {
    await f.edit("first");
    await f.edit("second");
    const first = await f.list("changes", { limit: 1 });
    expect(first.nextOffset).toBe(1);
    await expect(f.list("changes", { offset: 1 })).rejects.toThrow();
    expect(
      (await f.list("changes", { offset: 1, snapshot: first.snapshot })).items,
    ).toHaveLength(1);
    await f.edit("third");
    await expect(
      f.list("changes", { offset: 1, snapshot: first.snapshot }),
    ).rejects.toThrow();
  } finally {
    await f.close();
  }
});
