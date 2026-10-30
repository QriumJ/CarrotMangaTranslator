// @ts-check
const { createHash } = require("node:crypto");
const { createReadStream } = require("node:fs");
const { readFile, stat, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const YAML = require("yaml");

/** @param {string} directory @param {string} version @param {boolean} [seal] */
async function verifyWindowsUpdateMetadata(directory, version, seal = false) {
  const name = `CarrotMangaTranslator-Setup-v${version}.exe`;
  const metadataPath = join(directory, "latest.yml");
  if ((await stat(metadataPath)).size > 1024 * 1024)
    throw new Error("Update metadata exceeds its budget");
  const metadata = YAML.parse(await readFile(metadataPath, "utf8"));
  if (
    metadata?.version !== version ||
    metadata?.path !== name ||
    metadata?.files?.length !== 1 ||
    metadata.files[0].url !== name
  )
    throw new Error(
      "Update metadata must reference the exact published Windows installer",
    );
  const file = join(directory, name);
  const size = (await stat(file)).size;
  const hash = createHash("sha512");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const sha512 = hash.digest("base64");
  if (seal && metadata.files[0].size === undefined)
    metadata.files[0].size = size;
  if (
    metadata.files[0].size !== size ||
    metadata.files[0].sha512 !== sha512 ||
    metadata.sha512 !== sha512
  )
    throw new Error("Windows update checksum/size mismatch");
  if (seal) await writeFile(metadataPath, YAML.stringify(metadata));
  return { name, size, sha512 };
}
module.exports = { verifyWindowsUpdateMetadata };
if (require.main === module) {
  const version = require("../package.json").version;
  verifyWindowsUpdateMetadata(process.argv[2] || "dist", version)
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
