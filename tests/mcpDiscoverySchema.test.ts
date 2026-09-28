import { expect, it } from "vitest";
import { z } from "zod/v4";
import {
  mcpOutputSchemas,
  mcpToolOutputSchema,
} from "../src/main/mcp/mcpOutputSchemas";

// Characterize the public error envelope independently of discovery encoding.
const error = z
  .object({
    error: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    nextAction: z.string(),
    issues: z
      .array(
        z
          .object({
            field: z.string(),
            code: z.string(),
            expected: z.string().optional(),
            minimum: z.number().optional(),
            maximum: z.number().optional(),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict();

function expandLocalRefs(
  value: unknown,
  root: Record<string, unknown>,
  seen = new Map<string, string>(),
  path = "#",
): unknown {
  if (Array.isArray(value))
    return value.map((item, index) =>
      expandLocalRefs(item, root, seen, `${path}/${index}`),
    );
  if (!value || typeof value !== "object") return value;
  const {
    $defs: _definitions,
    $ref,
    ...fields
  } = value as Record<string, unknown>;
  const expanded = Object.fromEntries(
    Object.entries(fields).map(([key, item]) => [
      key,
      expandLocalRefs(item, root, seen, `${path}/${key}`),
    ]),
  );
  if ($ref === undefined) return expanded;
  expect($ref).toMatch(/^#\/\$defs\/[^/]+$/);
  const reference = $ref as string;
  const name = reference.slice("#/$defs/".length);
  const definitions = root.$defs as Record<string, unknown> | undefined;
  expect(definitions).toHaveProperty(name);
  // The existing arbitrary JSON value contracts are recursive. Retain their
  // cycles at the expanded location, independent of generated definition IDs.
  if (seen.has(reference)) return { $ref: seen.get(reference), ...expanded };
  return {
    ...(expandLocalRefs(
      definitions?.[name],
      root,
      new Map([...seen, [reference, path]]),
      path,
    ) as Record<string, unknown>),
    ...expanded,
  };
}

it("compacts every output without changing its self-contained JSON Schema contract", () => {
  let inlineBytes = 0;
  let compactBytes = 0;
  for (const [name, schema] of Object.entries(mcpOutputSchemas)) {
    const compact = mcpToolOutputSchema(name);
    expect(compact, name).toBeDefined();
    if (!compact) throw new Error(`Missing schema: ${name}`);
    const inline = {
      ...z.toJSONSchema(z.union([schema, error])),
      type: "object",
    };
    expect(expandLocalRefs(compact, compact), name).toEqual(
      expandLocalRefs(inline, inline),
    );
    inlineBytes += Buffer.byteLength(JSON.stringify(inline));
    compactBytes += Buffer.byteLength(JSON.stringify(compact));
  }
  expect(compactBytes).toBeLessThan(inlineBytes);
});
