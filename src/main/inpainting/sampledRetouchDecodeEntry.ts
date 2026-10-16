import { app, nativeImage } from "electron";
import { readFile, writeFile } from "node:fs/promises";

/** Isolated normalization process; runs before startup locks or library initialization. */
export function startSampledImageDecode(args: string[]): boolean {
  const index = args.indexOf("--mgt-sampled-image-decode");
  if (index < 0) return false;
  app.disableHardwareAcceleration();
  const input = args[index + 1],
    output = args[index + 2];
  if (!input || !output) {
    app.exit(2);
    return true;
  }
  void normalize(input, output).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    app.exit(2);
  });
  return true;
}

async function normalize(input: string, output: string): Promise<void> {
  let image = nativeImage.createFromPath(input);
  if (image.isEmpty())
    image = nativeImage.createFromBuffer(await readFile(input));
  if (image.isEmpty()) {
    app.exit(3);
    return;
  }
  // Match loadPageImage().toBitmap(): toPNG() alone retains the source ICC
  // profile and its unconverted samples, which pngjs cannot color-manage.
  const normalized = nativeImage.createFromBitmap(
    image.toBitmap(),
    image.getSize(),
  );
  await writeFile(output, normalized.toPNG(), { flag: "wx" });
  app.exit(0);
}
