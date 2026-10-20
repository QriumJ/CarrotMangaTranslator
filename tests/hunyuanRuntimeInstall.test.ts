import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as yazl from "yazl";
import { expect, it, vi } from "vitest";

const {
  SPEED_LLAMA_RUNTIME_CPU,
} = require("../src/main/runtime/model/speed-llama-runtime-contracts.cjs");
const {
  ensureDefaultLlamaRuntimeDownloaded,
} = require("../src/main/runtime/model/llama-runtime-download.cjs");

it("installs an explicitly selected CPU archive, seals it and reuses it without a download", async () => {
  const zip = new yazl.ZipFile();
  for (const name of [
    "llama-server.exe",
    "llama-server-impl.dll",
    "ggml-base.dll",
    "ggml-cpu-x64.dll",
  ])
    zip.addBuffer(Buffer.from(`fixture-${name}`), name);
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  let requests = 0;
  const server = createServer((request, response) => {
    requests++;
    response.writeHead(200, { "Content-Length": bytes.length });
    response.end(request.method === "HEAD" ? undefined : bytes);
  });
  const root = await mkdtemp(join(tmpdir(), "hy-install-"));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing fixture port");
    const runtime = {
      ...SPEED_LLAMA_RUNTIME_CPU,
      archives: [
        {
          archive: "cpu-fixture.zip",
          url: `http://127.0.0.1:${address.port}/cpu.zip`,
          expectedBytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      ],
    };
    const onProgress = vi.fn();
    const options = {
      workingDir: root,
      toolsDir: join(root, "tools"),
      managedToolsDir: join(root, "managed"),
      llamaRuntimePurpose: "hunyuan",
      llamaRuntimeProfile: "cpu",
      onProgress,
    };
    await ensureDefaultLlamaRuntimeDownloaded(options, runtime);
    const installed = join(root, "managed", runtime.dir);
    expect(await readFile(join(installed, "ggml-cpu-x64.dll"), "utf8")).toBe(
      "fixture-ggml-cpu-x64.dll",
    );
    expect(
      JSON.parse(await readFile(join(installed, ".mgt-runtime.json"), "utf8"))
        .id,
    ).toBe(runtime.id);
    expect(
      onProgress.mock.calls.some(([event]) =>
        event.installLogLine?.includes("CPU"),
      ),
    ).toBe(true);
    const count = requests;
    await ensureDefaultLlamaRuntimeDownloaded(options, runtime);
    expect(requests).toBe(count);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  }
});
