import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import YAML from "yaml";
const { verifyWindowsUpdateMetadata } =
  require("../scripts/verify-windows-update-metadata.cjs") as {
    verifyWindowsUpdateMetadata: (
      directory: string,
      version: string,
      seal?: boolean,
    ) => Promise<{ name: string; size: number; sha512: string }>;
  };

it("seals ZIP-installer metadata without renaming the payload and rejects changed bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "carrot-update-metadata-"));
  const name = "CarrotMangaTranslator-Setup-v3.8.0.exe";
  const data = Buffer.from("installer test fixture");
  const sha512 = createHash("sha512").update(data).digest("base64");
  const metadata = {
    version: "3.8.0",
    path: name,
    sha512,
    files: [{ url: name, sha512 }],
  };
  await writeFile(join(root, name), data);
  await writeFile(join(root, "latest.yml"), YAML.stringify(metadata));
  await expect(verifyWindowsUpdateMetadata(root, "3.8.0")).rejects.toThrow(
    "checksum/size",
  );
  expect(await verifyWindowsUpdateMetadata(root, "3.8.0", true)).toMatchObject({
    name,
    size: data.length,
  });
  expect(
    YAML.parse(await readFile(join(root, "latest.yml"), "utf8")).files[0].size,
  ).toBe(data.length);
  await writeFile(join(root, name), Buffer.alloc(data.length));
  await expect(
    verifyWindowsUpdateMetadata(root, "3.8.0", true),
  ).rejects.toThrow("checksum/size");
});
