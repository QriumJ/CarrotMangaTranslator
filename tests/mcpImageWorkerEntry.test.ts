import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { afterEach, expect, it, vi } from "vitest";
import type { McpImageWorkerResponse } from "../src/main/mcp/mcpImageWorkerProtocol";

class ParentPortBoundary extends EventEmitter {
  readonly responses: McpImageWorkerResponse[] = [];
  readonly transfers: number[] = [];
  readonly postMessage = vi.fn(
    (response: McpImageWorkerResponse, transfer: ArrayBuffer[] = []) => {
      this.transfers.push(transfer.length);
      this.responses.push(structuredClone(response, { transfer }));
    },
  );
}
async function loadWorker(port: ParentPortBoundary | null) {
  vi.resetModules();
  vi.doMock("node:worker_threads", () => ({ parentPort: port }));
  await import("../src/main/mcp/mcpImageWorker");
}
afterEach(() => {
  vi.doUnmock("node:worker_threads");
  vi.resetModules();
});

it("rejects an entry executed outside a worker thread", async () => {
  await expect(loadWorker(null)).rejects.toThrow("must run in a worker thread");
});

it("validates real owned bytes and sends only metadata for upload completion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mcp-worker-entry-"));
  const file = join(directory, "owned.png");
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(255);
  const bytes = PNG.sync.write(png);
  await writeFile(file, bytes);
  try {
    const port = new ParentPortBoundary();
    await loadWorker(port);
    port.emit("message", {
      id: 1,
      kind: "validate",
      input: {
        path: file,
        declared: {
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          width: 2,
          height: 2,
          purpose: "mask",
        },
      },
    });
    await vi.waitFor(() => expect(port.responses).toHaveLength(1));
    expect(port.responses[0]).toEqual({
      id: 1,
      kind: "validate",
      result: { hasTransparency: false, selectedPixels: 4 },
    });
    expect(port.transfers).toEqual([0]);
  } finally {
    await unlink(file);
    await rmdir(directory);
  }
});

it("transfers owned lettering output arrays without detaching the input PNG", async () => {
  const port = new ParentPortBoundary();
  await loadWorker(port);
  const png = new PNG({ width: 2, height: 2 });
  png.data.fill(129);
  const bytes = PNG.sync.write(png);
  port.emit("message", {
    id: 2,
    kind: "lettering",
    input: { image: bytes, width: 2, height: 2 },
  });
  await vi.waitFor(() => expect(port.responses).toHaveLength(1));
  const response = port.responses[0];
  if ("error" in response || response.kind !== "lettering")
    throw new Error("Expected lettering response");
  expect(PNG.sync.read(Buffer.from(response.result.bytes)).data).toEqual(
    png.data,
  );
  expect([...response.result.mask]).toEqual([1, 1, 1, 1]);
  expect(port.transfers).toEqual([2]);
  expect(bytes.length).toBeGreaterThan(45);
});

it("serializes invalid-edit failures without returning a partial raster", async () => {
  const port = new ParentPortBoundary();
  await loadWorker(port);
  port.emit("message", {
    id: 3,
    kind: "lettering",
    input: { image: Buffer.from("corrupt"), width: 2, height: 2 },
  });
  await vi.waitFor(() => expect(port.responses).toHaveLength(1));
  expect(port.responses[0]).toMatchObject({
    id: 3,
    error: {
      code: "invalid_edit",
      message: expect.stringContaining("complete 8-bit PNG"),
    },
  });
  expect(port.responses[0]).not.toHaveProperty("result");
  expect(port.transfers).toEqual([0]);
});

it("answers a response-transfer failure as an error instead of leaving the request pending", async () => {
  const port = new ParentPortBoundary();
  port.postMessage.mockImplementationOnce(() => {
    throw new Error("transfer failed");
  });
  await loadWorker(port);
  const png = new PNG({ width: 2, height: 2 });
  port.emit("message", {
    id: 4,
    kind: "lettering",
    input: { image: PNG.sync.write(png), width: 2, height: 2 },
  });
  await vi.waitFor(() => expect(port.responses).toHaveLength(1));
  expect(port.responses[0]).toEqual({
    id: 4,
    error: { name: "Error", message: "transfer failed" },
  });
});
