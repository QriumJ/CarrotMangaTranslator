/** Portable output directory names shared by import previews and image export. */
export function sanitizeOutputPathSegment(
  value: string,
  fallback: string,
): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
  const resolved =
    cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : fallback;
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(resolved)
    ? `_${resolved}`
    : resolved;
}
