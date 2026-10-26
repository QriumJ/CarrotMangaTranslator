import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  McpEditError,
  mcpStorageFailure,
} from "../src/main/application/mcpEditPolicy";
import { mcpToolError } from "../src/main/mcp/mcpToolResult";
import { RetentionIndexSchema } from "../src/main/mcp/mcpRetentionRecords";

it.each(["ENOSPC", "EDQUOT"])(
  "reports %s as actual storage exhaustion without leaking native paths",
  (code) => {
    const error = Object.assign(new Error("private disk path"), { code });
    expect(mcpStorageFailure(error)?.code).toBe("storage_full");
    const result = mcpToolError(error);
    expect(result.structuredContent).toMatchObject({
      error: "storage_full",
      retryable: false,
    });
    expect(JSON.stringify(result)).not.toContain("private disk path");
  },
);

it.each([
  null,
  undefined,
  "full",
  5,
  {},
  new Error("private error"),
  { code: "EIO" },
])("does not disguise unrelated failures as a history quota: %j", (error) => {
  expect(mcpStorageFailure(error)).toBeUndefined();
  expect(mcpToolError(error).structuredContent.error).toBe("operation_failed");
});

it("explains reclaimed recovery without asking to clean history or repeat a successful save", () => {
  const result = mcpToolError(
    new McpEditError("history_reclaimed", "Older undo history rotated."),
  );
  expect(result.structuredContent).toMatchObject({
    error: "history_reclaimed",
    retryable: false,
  });
  expect(result.structuredContent.nextAction).toContain("Do not repeat");
  expect(
    mcpToolError(new McpEditError("retention_full", "Legacy failure"))
      .structuredContent.nextAction,
  ).toContain("do not ask the user to delete");
});

it("permits payload-free receipts only for reclaimed page changes and keeps duplicate-ID validation", () => {
  const entry = {
    id: randomUUID(),
    owner: "owner",
    kind: "change",
    operation: "carrot_update_page_blocks",
    requestId: null,
    createdAt: 1,
    expiresAt: 100,
    bytes: 0,
    pageCount: 1,
    mimeType: null,
    sha256: null,
    reclaimedAt: 2,
  };
  expect(
    RetentionIndexSchema.parse({ version: 1, entries: [entry] }).entries[0],
  ).toEqual(entry);
  for (const patch of [{ bytes: 1 }, { kind: "context" }]) {
    expect(() =>
      RetentionIndexSchema.parse({
        version: 1,
        entries: [{ ...entry, ...patch }],
      }),
    ).toThrow("Only retired page history");
  }
  expect(() =>
    RetentionIndexSchema.parse({ version: 1, entries: [entry, entry] }),
  ).toThrow("Duplicate retained IDs");
});
