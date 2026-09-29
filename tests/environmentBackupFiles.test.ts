import { afterEach, expect, it, vi } from "vitest";
import { join, resolve } from "node:path";
import {
  MAX_BACKUP_BYTES,
  MAX_BACKUP_FILES,
} from "../src/main/environmentBackup/policy";

vi.mock("electron", () => ({ app: { isPackaged: false } }));

afterEach(() => {
  vi.doUnmock("node:fs/promises");
  vi.resetModules();
});

it("enumerates a 150,000-file subtree without using the runtime argument stack", async () => {
  const root = resolve("virtual-backup");
  const nested = join(root, "work");
  const count = 150_000;
  vi.doMock("node:fs/promises", async () => ({
    ...(await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    )),
    lstat: async (path: string) => ({
      isSymbolicLink: () => false,
      isDirectory: () => path === root || path === nested,
      isFile: () => path !== root && path !== nested,
    }),
    readdir: async (path: string) =>
      path === root
        ? ["work"]
        : Array.from(
            { length: count },
            (_, index) => `page-${String(index).padStart(6, "0")}.png`,
          ),
  }));
  const { regularFiles } = await import("../src/main/environmentBackup/files");
  const files = await regularFiles(root);
  expect(files).toHaveLength(count);
  expect(files[0]).toBe("work/page-000000.png");
  expect(files.at(-1)).toBe("work/page-149999.png");
});

it("rejects an aggregate inventory over one million files before allocating copy output", async () => {
  const disk = mockBackupInventory({ fonts: MAX_BACKUP_FILES, extra: 1 });
  const { copyCategories } =
    await import("../src/main/environmentBackup/snapshot");
  await expect(
    copyCategories(
      disk.source,
      disk.target,
      ["fonts", "extra"],
      new AbortController().signal,
    ),
  ).rejects.toThrow("Backup contains too many files.");

  expect(disk.filesInspected()).toBe(MAX_BACKUP_FILES + 1);
  expect(disk.statfs).not.toHaveBeenCalled();
  expect(disk.mkdir).not.toHaveBeenCalled();
}, 30_000); // no million-file directory or payload is created on disk. // Exercise the actual million-file boundary through a virtual filesystem;

it("rejects an aggregate byte budget overflow before opening output files", async () => {
  const disk = mockBackupInventory(
    { fonts: 1, extra: 1 },
    MAX_BACKUP_BYTES / 2 + 1,
  );
  const { copyCategories } =
    await import("../src/main/environmentBackup/snapshot");
  await expect(
    copyCategories(
      disk.source,
      disk.target,
      ["fonts", "extra"],
      new AbortController().signal,
    ),
  ).rejects.toThrow("Environment exceeds the supported backup size.");
  expect(disk.statfs).not.toHaveBeenCalled();
  expect(disk.mkdir).not.toHaveBeenCalled();
});

function mockBackupInventory(
  categories: Readonly<Record<string, number>>,
  fileBytes = 0,
) {
  const source = resolve("virtual-backup-budget");
  const target = resolve("virtual-backup-target");
  const directories = new Map(
    Object.entries(categories).map(([name, count]) => [
      join(source, name),
      count,
    ]),
  );
  const directoryInfo = {
    isSymbolicLink: () => false,
    isDirectory: () => true,
    isFile: () => false,
    size: 0,
  };
  const fileInfo = {
    isSymbolicLink: () => false,
    isDirectory: () => false,
    isFile: () => true,
    size: fileBytes,
  };
  let inspected = 0;
  const statfs = vi.fn(async () => ({
    bavail: Number.MAX_SAFE_INTEGER,
    bsize: 1,
  }));
  const mkdir = vi.fn(async () => {
    throw new Error("Budget preflight must not create copy output");
  });
  vi.doMock("node:fs/promises", async () => ({
    ...(await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    )),
    lstat: async (path: string) => {
      if (path === source || directories.has(path)) return directoryInfo;
      inspected += 1;
      return fileInfo;
    },
    readdir: async (path: string) =>
      Array.from(
        { length: directories.get(path) ?? 0 },
        (_, index) => `page-${index.toString(36)}.png`,
      ),
    statfs,
    mkdir,
  }));
  return { source, target, statfs, mkdir, filesInspected: () => inspected };
}
