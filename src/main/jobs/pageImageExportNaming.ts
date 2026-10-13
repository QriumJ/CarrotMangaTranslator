import { explicitPageOutputBase } from "../../shared/pageOutputNaming";
import { sanitizeOutputPathSegment } from "../../shared/outputPathSegment";
import { basename, extname } from "node:path";
import { resolveSourceImageFormat } from "../../shared/sourceImageFormat";

export function formatPageImageExportOrder(index: number): string {
  return String(index + 1).padStart(3, "0");
}

export function sanitizeOutputBaseName(value: string): string {
  const raw = basename(value, extname(value)) || "page";
  return sanitizeOutputPathSegment(raw, "page");
}

export function buildPageImageExportRelativePath({
  chapterIndex,
  chapterTitle,
  pageIndex,
  pageName,
  sourceFileName,
  outputBaseName,
  outputFormat = "source",
}: {
  chapterIndex: number;
  chapterTitle: string;
  pageIndex: number;
  pageName: string;
  sourceFileName?: string;
  outputBaseName?: string;
  outputFormat?: "source" | "png" | "jpeg" | "webp" | "psd";
}): string {
  const extension =
    outputFormat === "source"
      ? resolveSourceImageFormat(extname(sourceFileName ?? pageName)).extension
      : outputFormat === "jpeg"
        ? "jpg"
        : outputFormat;
  const stem =
    explicitPageOutputBase({ outputBaseName }) ??
    `${formatPageImageExportOrder(pageIndex)}-${sanitizeOutputBaseName(pageName)}`;
  return `${formatPageImageExportOrder(chapterIndex)}-${sanitizeOutputPathSegment(
    chapterTitle,
    "chapter",
  )}\\${stem}.${extension}`;
}
