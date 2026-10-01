import {
  pageNameParts,
  PageOutputNameSchema,
  pageOutputNameError,
} from "./pageOrganization";

/** Explicit user names are never silently truncated, sanitized or numbered. */
export function explicitPageOutputBase(page: {
  outputBaseName?: string;
}): string | undefined {
  return page.outputBaseName === undefined
    ? undefined
    : PageOutputNameSchema.parse(page.outputBaseName);
}

export function assertUniquePageOutputNames(
  pages: { id: string; name: string; outputBaseName?: string }[],
): void {
  for (const page of pages) explicitPageOutputBase(page);
  if (findPageOutputNameConflicts(pages).size)
    throw new Error("Output name already exists.");
}

export function findPageOutputNameConflicts(
  pages: { id: string; name: string; outputBaseName?: string }[],
): Set<string> {
  const conflicts = new Set<string>();
  const seen = new Map<string, { explicit: boolean; id: string }>();
  pages.forEach((page, index) => {
    const explicit = page.outputBaseName;
    if (explicit !== undefined && pageOutputNameError(explicit)) return;
    const legacy =
      pageNameParts(page.name)
        .base.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .trim()
        .replace(/[. ]+$/g, "")
        .slice(0, 80) || "page";
    const base =
      explicit ??
      `${String(index + 1).padStart(3, "0")}-${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(legacy) ? "_" : ""}${legacy}`;
    const bases = explicit === undefined ? [base, legacy] : [base];
    for (const candidate of bases) {
      const key = candidate.normalize("NFC").toLowerCase();
      const previous = seen.get(key);
      if (
        previous &&
        previous.id !== page.id &&
        (explicit !== undefined || previous.explicit)
      ) {
        conflicts.add(page.id);
        conflicts.add(previous.id);
      }
      seen.set(key, { explicit: explicit !== undefined, id: page.id });
    }
  });
  return conflicts;
}
