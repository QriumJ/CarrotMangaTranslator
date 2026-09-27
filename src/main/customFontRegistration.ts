import { writeFileSync, rmSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { CustomFont } from "../shared/libraryTypes";
import {
  ALLOWED_FONT_EXTENSIONS,
  assertFontFileLooksValid,
  sanitizeFontLabel,
} from "./customFontFileValidation";

const MAX_FONTS = 200;
type CustomFontRegistrationDependencies = {
  validateFontLoad: (bytes: Buffer) => Promise<void>;
  listFonts: () => CustomFont[];
  saveFonts: (fonts: CustomFont[]) => void;
  getFontsDirectory: () => string;
};

export async function registerCustomFontFile(
  dependencies: CustomFontRegistrationDependencies,
  sourcePath: string,
): Promise<CustomFont> {
  const ext = extname(sourcePath).toLowerCase();
  if (!ALLOWED_FONT_EXTENSIONS.has(ext)) {
    throw new Error("TTF 또는 OTF 폰트 파일만 등록할 수 있습니다.");
  }
  const bytes = assertFontFileLooksValid(sourcePath, ext);
  const label = sanitizeFontLabel(basename(sourcePath, extname(sourcePath)));
  try {
    await dependencies.validateFontLoad(bytes);
  } catch (error) {
    throw new Error(
      `“${label}”: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  // Read the latest index after the asynchronous validation; concurrent imports
  // must not overwrite each other's entries. Store exactly the inspected bytes.
  const fonts = dependencies.listFonts();
  if (fonts.length >= MAX_FONTS) {
    throw new Error("등록할 수 있는 폰트 수를 초과했습니다.");
  }
  const id = randomUUID();
  const fileName = `${id}${ext}`;
  const destination = join(dependencies.getFontsDirectory(), fileName);
  writeFileSync(destination, bytes, { flag: "wx" });
  const font: CustomFont = {
    id,
    label,
    family: `MGTUser-${id}`,
    fileName,
  };
  try {
    dependencies.saveFonts([...fonts, font]);
  } catch (error) {
    rmSync(destination, { force: true });
    throw error;
  }
  return font;
}
