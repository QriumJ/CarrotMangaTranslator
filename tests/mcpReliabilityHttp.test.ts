import { expect, it, vi } from "vitest";
import { editingFixture } from "./mcpEditing.fixture";
import { createMcpTestGrant } from "./mcpOAuthGrant.fixture";
import { McpOAuthProvider } from "../src/main/mcp/mcpOAuthProvider";
import { McpOAuthSession } from "../src/main/mcp/mcpOAuthSession";
import { McpOAuthHttp } from "../src/main/mcp/mcpOAuthHttp";
import { McpPairingBroker } from "../src/main/mcp/mcpPairingBroker";
import { createMcpToolSet } from "../src/main/mcp/mcpToolSet";
import { startMcpHttpServer } from "../src/main/mcp/mcpHttpServer";
import { createPageRevision } from "../src/shared/pageRevision";

it("uses connection-scoped capabilities and carries valid maximum-size translations over HTTP", async () => {
  const f = editingFixture();
  const origin = "https://reliability.example.test",
    secret = "p".repeat(43);
  const provider = new McpOAuthProvider(origin, secret, Date.now, {
    allowEdits: true,
    allowImages: true,
    allowProcessing: true,
  });
  const grant = createMcpTestGrant(origin, secret);
  const read = grant(provider, "carrot.read");
  const full = grant(
    provider,
    "carrot.read carrot.edit carrot.images carrot.process",
  );
  const tools = createMcpToolSet(
    { listLibrary: vi.fn(), openChapter: f.openChapter },
    vi.fn(),
    true,
    { service: f.service, allowEditing: true },
    [
      "carrot_run_page_ocr",
      "carrot_run_page_erasure",
      "carrot_run_block_translation",
    ].map((name) => ({
      name,
      description: "Fixture executor",
      inputSchema: {},
      requiredScopes: ["carrot.read", "carrot.process"],
      invoke: vi.fn(),
    })),
  );
  const server = await startMcpHttpServer({
    config: { port: 0, token: "t".repeat(43), publicOrigin: origin },
    tools,
    enforceScopes: true,
    reportError: vi.fn(),
    oauthHttp: new McpOAuthHttp(origin, secret, {
      session: new McpOAuthSession(provider, { save: async () => {} }),
      pairing: new McpPairingBroker(provider, secret),
    }),
  });
  const call = async (name: string, args: unknown, token = full) => {
    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    expect(response.status).toBe(200);
    return response.json();
  };
  try {
    expect(
      (await call("carrot_get_capabilities", {}, read)).result
        .structuredContent,
    ).toMatchObject({
      mode: "read-only",
      editing: false,
      ocr: false,
      translation: false,
      erasure: false,
      imageTransfer: false,
    });
    expect(
      (await call("carrot_get_capabilities", {})).result.structuredContent,
    ).toMatchObject({
      mode: "page-processing",
      editing: true,
      ocr: true,
      translation: true,
      erasure: true,
      imageTransfer: true,
    });
    const page = f.chapter.pages[0];
    page.blocks = Array.from({ length: 100 }, (_, index) => ({
      ...page.blocks[0],
      id: `block-${index}`,
      generatedLettering: undefined,
    }));
    const text = "한".repeat(8192);
    const response = await call("carrot_update_translations", {
      chapterId: "chapter",
      pageId: "page",
      revision: createPageRevision(page),
      edits: page.blocks.map((block) => ({
        blockId: block.id,
        translatedText: text,
      })),
    });
    expect(response.result).toMatchObject({
      isError: false,
      structuredContent: { status: "saved", changed: 100 },
    });
    expect(page.blocks.every((block) => block.translatedText === text)).toBe(
      true,
    );
    const invalid = await call("carrot_update_translations", {
      ...f.request,
      edits: [{ blockId: "a", translatedText: "x".repeat(8193) }],
    });
    expect(invalid.result).toMatchObject({
      isError: true,
      structuredContent: {
        error: "invalid_arguments",
        issues: [{ field: "edits.0.translatedText", maximum: 8192 }],
      },
    });
    expect(f.savePageBlocks).toHaveBeenCalledOnce();
  } finally {
    await server.close();
  }
});
