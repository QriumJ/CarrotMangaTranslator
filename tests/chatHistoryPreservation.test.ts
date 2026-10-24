import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { ChatRepository } from "../src/main/chat/chatRepository";
import { chatFixture } from "./helpers/chatFixture";
import { chatSnapshot, mergeChatSnapshots } from "../src/shared/chatSnapshot";
vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: () => process.cwd(),
    getLocale: () => "ko",
  },
}));

it("indexes and pages old v1 records without changing transcript or attachment bytes", async () => {
  const f = await chatFixture();
  try {
    const session = {
      ...(await f.repository.read(f.session.id)),
      items: Array.from({ length: 241 }, (_, n) => ({
        id: String(n),
        role: "assistant" as const,
        text: `기록 ${n}`,
        state: "completed" as const,
        createdAt: n,
      })),
    };
    await f.repository.save(session);
    const image = await f.repository.addImage(
      session.id,
      "old.png",
      "data:image/png;base64,AA==",
    );
    const recordPath = join(f.root, "chat", `${session.id}.json`);
    const imagePath = join(f.root, "chat", session.id, `${image.id}.json`);
    const original = await readFile(recordPath),
      originalImage = await readFile(imagePath);
    const cold = new ChatRepository(f.root);
    const read = vi.spyOn(cold, "read");
    expect(await cold.list()).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(1);
    await cold.list();
    expect(read).toHaveBeenCalledTimes(1);
    const restart = new ChatRepository(f.root);
    const reread = vi.spyOn(restart, "read");
    await restart.list();
    expect(reread).not.toHaveBeenCalled();
    let page = chatSnapshot(await restart.read(session.id));
    expect(page.items).toHaveLength(80);
    while (page.itemWindow?.start)
      page = mergeChatSnapshots(
        page,
        chatSnapshot(session, page.itemWindow.start),
      );
    expect(page.items).toEqual(session.items);
    expect(await readFile(recordPath)).toEqual(original);
    expect(await readFile(imagePath)).toEqual(originalImage);
    await writeFile(recordPath, '{"broken":');
    expect((await restart.list())[0].loadError).toBeTruthy();
    expect(await readFile(recordPath, "utf8")).toBe('{"broken":');
  } finally {
    await f.cleanup();
  }
});

it("rebuilds stale or mismatched summary records from the preserved original", async () => {
  const f = await chatFixture();
  try {
    await new ChatRepository(f.root).list();
    const path = join(f.root, "chat", "summaries", `${f.session.id}.json`);
    const index = JSON.parse(await readFile(path, "utf8"));
    index.summary.id = "11111111-1111-4111-8111-111111111111";
    await writeFile(path, JSON.stringify(index));
    const mismatch = new ChatRepository(f.root);
    const read = vi.spyOn(mismatch, "read");
    expect((await mismatch.list())[0].id).toBe(f.session.id);
    expect(read).toHaveBeenCalledTimes(1);
    index.stamp = "stale";
    await writeFile(path, JSON.stringify(index));
    const stale = new ChatRepository(f.root);
    const reread = vi.spyOn(stale, "read");
    expect((await stale.list())[0].id).toBe(f.session.id);
    expect(reread).toHaveBeenCalledTimes(1);
  } finally {
    await f.cleanup();
  }
});

it("isolates a non-Error storage failure without hiding other conversations", async () => {
  const f = await chatFixture();
  try {
    const repository = new ChatRepository(f.root);
    vi.spyOn(repository, "read").mockRejectedValueOnce("storage unavailable");
    const entries = await repository.list();
    expect(entries[0].loadError).toBe("storage unavailable");
    expect((await repository.list())[0].loadError).toBeUndefined();
    expect((await f.repository.read(f.session.id)).id).toBe(f.session.id);
  } finally {
    await f.cleanup();
  }
});
