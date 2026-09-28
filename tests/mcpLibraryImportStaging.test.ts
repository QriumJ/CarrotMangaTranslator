import { randomUUID } from "node:crypto";
import {
  open,
  readFile,
  readdir,
  realpath,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join, relative } from "node:path";
import { expect, it, vi } from "vitest";
import { libraryImportFixture } from "./mcpLibraryImport.fixture";
import { withFileSymlink } from "./fileSymlink.fixture";
import type { PreparedImportPreview } from "../src/shared/importTypes";
import type { McpOperationContext } from "../src/main/application/mcpOperationService";

function preview(paths: string[]): PreparedImportPreview {
  return {
    preview: {
      mode: "single",
      sourceKind: "images",
      suggestedWorkTitle: "Fixture",
      chapters: [
        {
          draftId: randomUUID(),
          title: "Fixture",
          sourceKind: "images",
          pages: paths.map((sourcePath, index) => ({
            name: `page-${index}.png`,
            sourcePath,
            sourceKind: "file",
          })),
        },
      ],
    },
  };
}
function context(): McpOperationContext {
  return {
    id: randomUUID(),
    signal: new AbortController().signal,
    assertAuthorized: () => {},
    progress: () => {},
  };
}

it("accepts a trusted system temporary-root alias while rejecting a nested directory link", async () => {
  const f = await libraryImportFixture();
  const alias = `${f.env.root}-alias`;
  const nested = join(f.env.root, "nested-link");
  try {
    await symlink(f.env.root, alias, "junction");
    await symlink(f.env.root, nested, "junction");
    const { freezeMcpImport } =
      await import("../src/main/mcp/mcpLibraryImportStaging");
    const variable = process.platform === "win32" ? "TEMP" : "TMPDIR";
    const previous = process.env[variable];
    process.env[variable] = alias;
    try {
      const child = relative(f.env.root, f.originals[0]);
      const frozen = await freezeMcpImport(
        preview([join(alias, child)]),
        f.env.root,
        context(),
      );
      await frozen.verify();
      expect(frozen.sourceBytes).toBe(f.bytes.length);
      await frozen.cleanup();
      await expect(
        freezeMcpImport(
          preview([join(alias, "nested-link", child)]),
          f.env.root,
          context(),
        ),
      ).rejects.toThrow(/symlink/);
      expect(await readFile(f.originals[0])).toEqual(f.bytes);
    } finally {
      if (previous === undefined) delete process.env[variable];
      else process.env[variable] = previous;
    }
  } finally {
    await unlink(nested);
    await unlink(alias);
    await f.close();
  }
});

it("accepts a regular selected file outside the configured temporary root", async () => {
  const f = await libraryImportFixture();
  const variable = process.platform === "win32" ? "TEMP" : "TMPDIR";
  const previous = process.env[variable];
  try {
    process.env[variable] = join(f.env.root, "another-system-temp-root");
    const { freezeMcpImport } =
      await import("../src/main/mcp/mcpLibraryImportStaging");
    const frozen = await freezeMcpImport(
      preview(await Promise.all(f.originals.map((path) => realpath(path)))),
      f.env.root,
      context(),
    );
    await frozen.verify();
    expect(await readFile(f.originals[0])).toEqual(f.bytes);
    await frozen.cleanup();
  } finally {
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
    await f.close();
  }
});

it("captures repeated source bytes once, preserves input objects and detects same-size staged corruption", async () => {
  const f = await libraryImportFixture();
  try {
    const { freezeMcpImport } =
      await import("../src/main/mcp/mcpLibraryImportStaging");
    const input = preview([f.originals[0], f.originals[0]]);
    const before = structuredClone(input);
    const frozen = await freezeMcpImport(input, f.env.root, context());
    expect(input).toEqual(before);
    expect(frozen.sourceBytes).toBe(f.bytes.length);
    expect(
      new Set(frozen.preview.chapters[0].pages.map((page) => page.sourcePath))
        .size,
    ).toBe(1);
    await frozen.verify();
    const path = frozen.preview.chapters[0].pages[0].sourcePath;
    const changed = Buffer.from(await readFile(path));
    changed[changed.length - 1] ^= 1;
    await writeFile(path, changed);
    await expect(frozen.verify()).rejects.toMatchObject({
      code: "revision_conflict",
    });
    await frozen.cleanup();
    await frozen.cleanup();
    expect(await readFile(f.originals[0])).toEqual(f.bytes);
  } finally {
    await f.close();
  }
});

it.each(["empty", "oversize"] as const)(
  "rejects %s source files without retaining copied input",
  async (kind) => {
    const f = await libraryImportFixture();
    try {
      const { freezeMcpImport } =
        await import("../src/main/mcp/mcpLibraryImportStaging");
      const path = join(f.env.root, `boundary-${kind}.png`);
      {
        const file = await open(path, "wx");
        try {
          if (kind === "oversize") await file.truncate(128 * 1024 * 1024 + 1);
        } finally {
          await file.close();
        }
      }
      const cleanup = vi.fn(async () => {});
      await expect(
        freezeMcpImport({ ...preview([path]), cleanup }, f.env.root, context()),
      ).rejects.toThrow();
      expect(cleanup).toHaveBeenCalledOnce();
      expect(
        (await readdir(join(f.env.root, "tmp"))).filter((name) =>
          name.startsWith("mcp-import-"),
        ),
      ).toEqual([]);
      expect(await readFile(f.originals[0])).toEqual(f.bytes);
      expect(f.validate).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  },
);

it("rejects a file symlink without retaining copied input", async (testContext) => {
  const f = await libraryImportFixture();
  try {
    const { freezeMcpImport } =
      await import("../src/main/mcp/mcpLibraryImportStaging");
    const path = join(f.env.root, "boundary-symlink.png");
    await withFileSymlink(testContext, f.originals[0], path, async () => {
      await expect(
        freezeMcpImport(preview([path]), f.env.root, context()),
      ).rejects.toThrow();
      expect(await readFile(f.originals[0])).toEqual(f.bytes);
    });
  } finally {
    await f.close();
  }
});

it.each([0, 501])(
  "rejects %i preview pages before source copying and still releases native preparation",
  async (count) => {
    const f = await libraryImportFixture();
    try {
      const { freezeMcpImport } =
        await import("../src/main/mcp/mcpLibraryImportStaging");
      const cleanup = vi.fn(async () => {});
      await expect(
        freezeMcpImport(
          { ...preview(Array<string>(count).fill(f.originals[0])), cleanup },
          f.env.root,
          context(),
        ),
      ).rejects.toMatchObject({ code: "invalid_edit" });
      expect(cleanup).toHaveBeenCalledOnce();
      expect(
        (await readdir(join(f.env.root, "tmp"))).filter((name) =>
          name.startsWith("mcp-import-"),
        ),
      ).toEqual([]);
    } finally {
      await f.close();
    }
  },
);

it("releases partial capture on cancellation and does not expose a preview from later picker results", async () => {
  const f = await libraryImportFixture();
  try {
    const { freezeMcpImport } =
      await import("../src/main/mcp/mcpLibraryImportStaging");
    const cleanup = vi.fn(async () => {});
    const job = context();
    let checks = 0;
    job.assertAuthorized = () => {
      if (++checks === 3) throw new Error("Cancelled during capture");
    };
    await expect(
      freezeMcpImport({ ...preview(f.originals), cleanup }, f.env.root, job),
    ).rejects.toThrow("Cancelled");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(
      (await readdir(join(f.env.root, "tmp"))).filter((name) =>
        name.startsWith("mcp-import-"),
      ),
    ).toEqual([]);
    expect(await readFile(f.originals[0])).toEqual(f.bytes);
  } finally {
    await f.close();
  }
});
