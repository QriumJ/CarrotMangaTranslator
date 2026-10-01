import { z } from "zod";
import { hashStableValue } from "./blockFingerprint";
import type { LibraryChapter, LibraryPageRecord } from "./libraryTypes";

export function pageNameParts(name: string): {
  base: string;
  extension: string;
} {
  const match = /^(.*)(\.[a-zA-Z0-9]{1,10})$/.exec(name);
  return match && match[1]
    ? { base: match[1], extension: match[2] }
    : { base: name, extension: "" };
}

export function pageOutputNameError(
  name: string,
): "empty" | "invalid" | "long" | null {
  if (!name.trim()) return "empty";
  if (
    name !== name.trim() ||
    /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  )
    return "invalid";
  // Leave room for every supported image/PSD suffix on UTF-8 filesystems.
  if (name.length > 240 || new TextEncoder().encode(name).length > 240)
    return "long";
  return null;
}

export const PageOutputNameSchema = z
  .string()
  .max(240)
  .refine((name) => !pageOutputNameError(name));

export const EditPageOrganizationRequestSchema = z
  .object({
    chapterId: z.string().uuid(),
    revision: z.string().length(16),
    pageIds: z.array(z.string().uuid()).min(1).max(100000),
    names: z
      .array(
        z
          .object({ pageId: z.string().uuid(), baseName: PageOutputNameSchema })
          .strict(),
      )
      .max(100000),
  })
  .strict();

export type EditPageOrganizationRequest = z.infer<
  typeof EditPageOrganizationRequestSchema
>;

export function pageOrganizationRevision(
  chapter: Pick<LibraryChapter, "id" | "workId" | "pageOrder" | "pages">,
): string {
  return hashStableValue({
    id: chapter.id,
    workId: chapter.workId,
    order: chapter.pageOrder,
    pages: chapter.pages
      .map(({ id, name, outputBaseName }) => ({ id, name, outputBaseName }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
}

export function applyPageOrganizationNames(
  pages: LibraryPageRecord[],
  names: EditPageOrganizationRequest["names"],
): LibraryPageRecord[] {
  const edits = new Map(names.map((edit) => [edit.pageId, edit.baseName]));
  if (
    edits.size !== names.length ||
    names.some(({ pageId }) => !pages.some((p) => p.id === pageId))
  )
    throw new Error("Invalid page name targets.");
  return pages.map((page) => {
    const baseName = edits.get(page.id);
    if (baseName === undefined || baseName === pageNameParts(page.name).base)
      return page;
    PageOutputNameSchema.parse(baseName);
    return {
      ...page,
      sourceFileName: page.sourceFileName ?? page.name,
      name: baseName + pageNameParts(page.name).extension,
      outputBaseName: baseName,
    };
  });
}
