import { afterEach, expect, it } from "vitest";
import {
  startMcpHttpServer,
  type McpHttpServer,
  type McpRequestDiagnostic,
} from "../src/main/mcp/mcpHttpServer";

const TOKEN = "test-secret-token-".repeat(3);
const traces: McpRequestDiagnostic[] = [];
const errors: unknown[] = [];
let server: McpHttpServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  traces.length = 0;
  errors.length = 0;
});

async function start(
  reportRequest = (trace: McpRequestDiagnostic) => {
    traces.push(trace);
  },
) {
  server = await startMcpHttpServer({
    config: { port: 0, token: TOKEN },
    tools: [],
    reportRequest,
    reportError: (error) => errors.push(error),
  });
  return server.url;
}

async function post(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, bytes: Buffer.byteLength(text), text };
}

it("records completed initialize and discovery once with exact response sizes", async () => {
  const url = await start();
  const initialized = await post(url, {
    jsonrpc: "2.0",
    id: "private-id",
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "private-client", version: "private-version" },
    },
  });
  const listed = await post(
    url,
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    },
    { "MCP-Protocol-Version": "2025-11-25" },
  );
  expect(traces).toHaveLength(2);
  expect(traces[0]).toMatchObject({
    route: "/mcp",
    httpMethod: "POST",
    rpcMethod: "initialize",
    protocol: "2025-11-25",
    status: 200,
    authorized: true,
    responseBytes: initialized.bytes,
    completed: true,
  });
  expect(traces[1]).toMatchObject({
    rpcMethod: "tools/list",
    protocol: "2025-11-25",
    status: 200,
    responseBytes: listed.bytes,
    toolCount: 0,
    completed: true,
  });
  expect(traces.every((trace) => trace.durationMs >= 0)).toBe(true);
  expect(JSON.stringify(traces)).not.toContain("private-");
  expect(errors).toEqual([]);
});

it("distinguishes authorization, transport rejection and RPC errors", async () => {
  const url = await start();
  const body = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  await post(url, body, { Authorization: "Bearer private-bad-token" });
  await post(url, body, { Accept: "application/json" });
  await post(url, body, { "MCP-Protocol-Version": "1999-01-01" });
  expect(traces).toHaveLength(3);
  expect(traces[0]).toMatchObject({
    status: 401,
    authorized: false,
    rpcMethod: "unread",
  });
  expect(traces[1]).toMatchObject({
    status: 406,
    authorized: true,
    rpcMethod: "unread",
  });
  expect(traces[2]).toMatchObject({
    status: 400,
    authorized: true,
    rpcMethod: "tools/list",
  });
  expect(traces[2]?.rpcError).toEqual(expect.any(Number));
  expect(JSON.stringify(traces)).not.toContain("private-");
  expect(errors).toEqual([]);
});

it("excludes arbitrary paths, queries, headers, RPC names and arguments", async () => {
  const url = await start();
  const body = {
    jsonrpc: "2.0",
    id: "private-id",
    method: "private-method",
    params: {
      sourceText: "private-page-content",
      protocolVersion: "private-version",
    },
  };
  await post(`${url}?code=private-code`, body, { Cookie: "private-cookie" });
  await post(url.replace("/mcp", "/private-path"), body);
  await post(url, body, { "MCP-Protocol-Version": "private-protocol" });
  expect(traces).toHaveLength(3);
  expect(traces[0]).toMatchObject({ route: "/mcp", status: 404 });
  expect(traces[1]).toMatchObject({ route: "other", status: 404 });
  expect(traces[2]).toMatchObject({ rpcMethod: "other", protocol: "invalid" });
  expect(JSON.stringify(traces)).not.toContain("private-");
  expect(JSON.stringify(traces)).not.toContain(TOKEN);
});

it("reports a failed diagnostic sink without breaking the HTTP response", async () => {
  const failure = new Error("diagnostic sink failed");
  const url = await start(() => {
    throw failure;
  });
  const response = await post(url, { jsonrpc: "2.0", id: 1, method: "ping" });
  expect(response.status).toBe(200);
  expect(JSON.parse(response.text)).toEqual({
    jsonrpc: "2.0",
    id: 1,
    result: {},
  });
  expect(errors).toEqual([failure]);
});
