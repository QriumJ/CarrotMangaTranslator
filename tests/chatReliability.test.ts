import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { chatFixture, chatRequest } from "./helpers/chatFixture";
vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: () => process.cwd(),
    getLocale: () => "ko",
  },
}));

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it("attempts both cancellations even when the first stop save fails", async () => {
  const f = await chatFixture();
  try {
    await f.service.send(chatRequest(f.session.id));
    await vi.waitFor(() => expect(f.runtime.send).toHaveBeenCalledOnce());
    vi.spyOn(f.repository, "save").mockRejectedValueOnce(
      new Error("disk unavailable"),
    );
    const result = await f.service.stop(f.session.id);
    expect(f.runtime.stop).toHaveBeenCalledOnce();
    expect(f.cancelOperations).toHaveBeenCalledOnce();
    expect(result.state).toBe("failed");
  } finally {
    await f.cleanup();
  }
});

it("ignores old runtime completion and failures after Stop and a new send", async () => {
  const f = await chatFixture();
  try {
    await f.service.send(chatRequest(f.session.id));
    await vi.waitFor(() => expect(f.runtime.send).toHaveBeenCalledOnce());
    const old = f.events();
    await f.service.stop(f.session.id);
    await f.service.send(chatRequest(f.session.id, "새 요청"));
    await vi.waitFor(() => expect(f.runtime.send).toHaveBeenCalledTimes(2));
    old.notification({
      method: "turn/completed",
      params: { turn: { status: "completed" } },
    });
    old.failed(new Error("late failure"));
    expect((await f.service.read(f.session.id)).state).toBe("running");
    expect(f.runtime.close).toHaveBeenCalledTimes(1);
  } finally {
    await f.cleanup();
  }
});

it("does not compact after stop during prepare", async () => {
  const preparing = gate();
  const f = await chatFixture(async () => {
    await preparing.promise;
    return "native";
  });
  try {
    const compact = f.service.compact(f.session.id);
    await vi.waitFor(() => expect(f.runtime.prepare).toHaveBeenCalledOnce());
    await f.service.stop(f.session.id);
    preparing.resolve();
    expect((await compact).state).toBe("paused");
    expect(f.runtime.compact).not.toHaveBeenCalled();
  } finally {
    preparing.resolve();
    await f.cleanup();
  }
});

it("retains an uncertain attachment without blindly replaying it", async () => {
  const f = await chatFixture();
  try {
    const image = await f.service.attachImage(
      f.session.id,
      "uncertain.png",
      "data:image/png;base64,AA==",
    );
    f.runtime.send.mockRejectedValueOnce(new Error("ack lost"));
    const first = chatRequest(f.session.id);
    first.imageIds = [image.id];
    await f.service.send(first);
    await vi.waitFor(async () =>
      expect((await f.service.read(f.session.id)).state).toBe("failed"),
    );
    await f.service.send(chatRequest(f.session.id, "확인 후 계속"));
    await vi.waitFor(() => expect(f.runtime.send).toHaveBeenCalledTimes(2));
    const inputs = f.runtime.send.mock.calls[1][1];
    expect(inputs.filter((input) => input.type === "image")).toHaveLength(0);
    expect(JSON.stringify(inputs)).toContain(image.id);
    expect((await f.repository.read(f.session.id)).items[0].delivery).toBe(
      "uncertain",
    );
    expect((await f.repository.image(f.session.id, image.id)).dataUrl).toBe(
      image.dataUrl,
    );
  } finally {
    await f.cleanup();
  }
});

it("Stop during the last durable pre-send save prevents dispatch", async () => {
  const f = await chatFixture();
  const entered = gate(),
    release = gate();
  const save = f.repository.save.bind(f.repository);
  let delayed = false;
  vi.spyOn(f.repository, "save").mockImplementation(async (session) => {
    await save(session);
    if (
      !delayed &&
      session.items.some((item) => item.delivery === "uncertain")
    ) {
      delayed = true;
      entered.resolve();
      await release.promise;
    }
  });
  try {
    const request = chatRequest(f.session.id);
    await f.service.send(request);
    await entered.promise;
    await f.service.stop(f.session.id);
    expect(f.runtime.stop).toHaveBeenCalledOnce();
    expect(f.runtime.send).not.toHaveBeenCalled();
    release.resolve();
    await vi.waitFor(async () =>
      expect((await f.service.read(f.session.id)).items[0].delivery).toBe(
        "pending",
      ),
    );
    expect(f.runtime.send).not.toHaveBeenCalled();
    expect((await f.service.read(f.session.id)).state).toBe("paused");
  } finally {
    release.resolve();
    await f.cleanup();
  }
});

it("a provider interrupt failure still cancels native operations", async () => {
  const f = await chatFixture();
  try {
    await f.service.send(chatRequest(f.session.id));
    await vi.waitFor(() => expect(f.runtime.send).toHaveBeenCalledOnce());
    await f.observe({
      name: "carrot_run_page_erasure",
      args: {},
      content: [
        {
          type: "text",
          text: '{"jobId":"active-native-job","status":"running"}',
        },
      ],
    });
    f.runtime.stop.mockRejectedValueOnce(new Error("interrupt timeout"));
    const stopped = await f.service.stop(f.session.id);
    expect(f.cancelOperations).toHaveBeenCalledOnce();
    expect(f.runtime.close).toHaveBeenCalledOnce();
    expect(stopped.state).toBe("failed");
  } finally {
    await f.cleanup();
  }
});

it("one malformed saved chat is isolated without overwriting the original", async () => {
  const f = await chatFixture();
  const broken = join(f.root, "chat", `${randomUUID()}.json`);
  try {
    await writeFile(broken, '{"version":', "utf8");
    expect((await f.service.read(f.session.id)).id).toBe(f.session.id);
    expect(await f.service.list()).toHaveLength(2);
    expect((await f.service.list()).find((item) => item.loadError)?.state).toBe(
      "failed",
    );
    await expect(f.service.create()).resolves.toMatchObject({ state: "idle" });
    await unlink(broken);
    expect(await f.service.list()).toHaveLength(2);
  } finally {
    await f.cleanup();
  }
});

it("interrupted pending image-only message includes its image on continue", async () => {
  const preparing = gate();
  const f = await chatFixture(async () => {
    await preparing.promise;
    return "native-thread";
  });
  try {
    const image = await f.service.attachImage(
      f.session.id,
      "reference.png",
      "data:image/png;base64,AA==",
    );
    const first = chatRequest(f.session.id, "");
    first.imageIds = [image.id];
    await f.service.send(first);
    await vi.waitFor(() => expect(f.runtime.prepare).toHaveBeenCalled());
    await f.service.stop(f.session.id);
    const next = chatRequest(f.session.id, "첨부한 이미지 확인 계속해줘");
    await f.service.send(next);
    preparing.resolve();
    await vi.waitFor(() => expect(f.runtime.send).toHaveBeenCalledOnce());
    const inputs = f.runtime.send.mock.calls[0][1];
    expect(inputs.filter((input) => input.type === "image")).toHaveLength(1);
    expect(JSON.stringify(inputs)).toContain(image.id);
    expect((await f.service.read(f.session.id)).items[0].imageIds).toEqual([
      image.id,
    ]);
  } finally {
    preparing.resolve();
    await f.cleanup();
  }
});
