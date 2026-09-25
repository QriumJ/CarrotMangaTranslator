import { symlink, unlink } from "node:fs/promises";
import type { TestContext } from "vitest";

export async function withFileSymlink(
  context: TestContext,
  target: string,
  path: string,
  verify: () => Promise<void>,
) {
  try {
    await symlink(target, path, "file");
  } catch (error) {
    if (
      process.platform === "win32" &&
      (error as NodeJS.ErrnoException).code === "EPERM"
    )
      return context.skip(
        true,
        "Windows file-symlink privilege is unavailable; directory-junction checks still run.",
      );
    throw error;
  }
  try {
    await verify();
  } finally {
    await unlink(path);
  }
}
