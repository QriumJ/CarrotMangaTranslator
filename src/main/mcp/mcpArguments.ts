import type { McpPageWindow } from "../application/mcpLibraryReadService";

export class McpInvalidParams extends Error {
  readonly issues;
  constructor(
    issues: readonly {
      path?: readonly PropertyKey[];
      code?: string;
      expected?: unknown;
      minimum?: unknown;
      maximum?: unknown;
    }[] = [],
  ) {
    super("Invalid tool arguments. Follow the tool's input schema.");
    this.issues = issues.slice(0, 20).map((issue) => ({
      field:
        (issue.path ?? []).map(String).join(".").slice(0, 200) || "arguments",
      code: issue.code ?? "invalid_value",
      ...(typeof issue.expected === "string"
        ? { expected: issue.expected.slice(0, 100) }
        : {}),
      ...(typeof issue.minimum === "number" ? { minimum: issue.minimum } : {}),
      ...(typeof issue.maximum === "number" ? { maximum: issue.maximum } : {}),
    }));
  }
}

export function argumentObject(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new McpInvalidParams([{ code: "invalid_type", expected: "object" }]);
  return value as Record<string, unknown>;
}

export function allowArguments(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new McpInvalidParams([{ code: "unrecognized_keys" }]);
}

const ID_PATTERN = "^[A-Za-z0-9_-]{1,128}$";
export const identifierSchema = { type: "string", pattern: ID_PATTERN };
export const windowProperties = {
  offset: { type: "integer", minimum: 0, maximum: 1_000_000, default: 0 },
  limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
};

export function readIdentifier(value: unknown, field = "id"): string {
  if (typeof value !== "string" || !new RegExp(ID_PATTERN).test(value))
    throw new McpInvalidParams([
      {
        path: [field],
        code: "invalid_identifier",
        expected: "string matching " + ID_PATTERN,
        maximum: 128,
      },
    ]);
  return value;
}

export function readWindow(args: Record<string, unknown>): McpPageWindow {
  const offset =
    args.offset === undefined ? windowProperties.offset.default : args.offset;
  const limit =
    args.limit === undefined ? windowProperties.limit.default : args.limit;
  return {
    offset: readInteger(offset, windowProperties.offset, "offset"),
    limit: readInteger(limit, windowProperties.limit, "limit"),
  };
}

function readInteger(
  value: unknown,
  bounds: { minimum: number; maximum: number },
  field: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < bounds.minimum ||
    value > bounds.maximum
  )
    throw new McpInvalidParams([
      { path: [field], code: "invalid_range", expected: "integer", ...bounds },
    ]);
  return value;
}

export function readQuery(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > 200)
    throw new McpInvalidParams([
      {
        path: ["query"],
        code: "invalid_value",
        expected: "string",
        maximum: 200,
      },
    ]);
  return value;
}
