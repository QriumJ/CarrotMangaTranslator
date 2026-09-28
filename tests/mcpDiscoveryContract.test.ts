import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { retentionFixture } from "./mcpRetention.fixture";

it("advertises every production tool without the output schemas that break ChatGPT discovery", async () => {
  const f = await retentionFixture({ durableJobs: true });
  const { createMcpServerInfoTool } =
    await import("../src/main/mcp/mcpServerInfoTool");
  const { handleMcpMessage } = await import("../src/main/mcp/mcpProtocol");
  const { mcpOutputSchemas } = await import("../src/main/mcp/mcpOutputSchemas");
  try {
    const tools = [
      ...f.tools(),
      createMcpServerInfoTool({
        serverId: randomUUID(),
        dataProfileId: randomUUID(),
        runtimeId: randomUUID(),
        startedAt: Date.now(),
        appVersion: "test",
        resource: "https://fixture.test/mcp",
        mode: "development",
      }),
    ];
    const reply = await handleMcpMessage(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      },
      tools,
      (error) => {
        throw error;
      },
    );
    const body = JSON.parse(JSON.stringify(reply.body));
    expect(reply.status).toBe(200);
    expect(body.result).toMatchObject({
      resultType: "complete",
      ttlMs: 0,
      cacheScope: "private",
    });
    expect(
      body.result.tools.map((tool: { name: string }) => tool.name).sort(),
    ).toEqual(Object.keys(mcpOutputSchemas).sort());
    const legacy = await handleMcpMessage(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      tools,
      (error) => {
        throw error;
      },
    );
    const legacyBody = JSON.parse(JSON.stringify(legacy.body));
    expect(body.result.tools).toEqual(
      legacyBody.result.tools.map(
        ({ outputSchema: _output, ...descriptor }: Record<string, unknown>) =>
          descriptor,
      ),
    );
    for (const tool of body.result.tools) {
      // MCP Tool requires type: object at the input root, including union inputs.
      // https://modelcontextprotocol.io/specification/2026-07-28/schema#tool
      expect(tool.inputSchema, tool.name).toMatchObject({ type: "object" });
      expect(tool, tool.name).not.toHaveProperty("outputSchema");
    }
    for (const tool of legacyBody.result.tools) {
      expect(tool.outputSchema, tool.name).toMatchObject({ type: "object" });
    }
    expect(f.errors).toEqual([]);
  } finally {
    await f.close();
  }
});
