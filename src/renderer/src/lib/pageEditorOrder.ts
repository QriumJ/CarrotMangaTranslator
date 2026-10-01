export function parsePageRange(
  text: string,
  order: readonly string[],
): Set<string> {
  const result = new Set<string>();
  if (!text.trim()) return result;
  for (const part of text.split(/[,，]/)) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part);
    if (!match) throw new Error("range");
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1]);
    if (start < 1 || end < 1 || start > order.length || end > order.length)
      throw new Error("range");
    for (let i = Math.min(start, end); i <= Math.max(start, end); i++)
      result.add(order[i - 1]);
  }
  return result;
}

export function movePageGroup(
  order: readonly string[],
  selected: ReadonlySet<string>,
  target: "up" | "down" | "first" | "last" | { id: string; after: boolean },
): string[] {
  const moving = order.filter((id) => selected.has(id));
  if (!moving.length) return [...order];
  if (target === "up" || target === "down") {
    return moveOneStep(order, selected, target);
  }
  if (typeof target === "object" && selected.has(target.id)) return [...order];
  const rest = order.filter((id) => !selected.has(id));
  const index =
    target === "first"
      ? 0
      : target === "last"
        ? rest.length
        : rest.indexOf(target.id) + Number(target.after);
  if (index < 0) return [...order];
  return [...rest.slice(0, index), ...moving, ...rest.slice(index)];
}

export function sortPageSlots(
  order: readonly string[],
  selected: ReadonlySet<string>,
  names: Readonly<Record<string, string>>,
  mode: "asc" | "desc" | "reverse",
): string[] {
  const slots = order.filter((id) => selected.has(id));
  const collator = new Intl.Collator("en", {
    numeric: true,
    sensitivity: "base",
  });
  if (mode === "reverse") slots.reverse();
  else
    slots.sort(
      (a, b) =>
        collator.compare(names[a], names[b]) * (mode === "asc" ? 1 : -1),
    );
  let index = 0;
  return order.map((id) => (selected.has(id) ? slots[index++] : id));
}

function moveOneStep(
  order: readonly string[],
  selected: ReadonlySet<string>,
  target: "up" | "down",
): string[] {
  const result = [...order];
  const direction = target === "up" ? 1 : -1;
  for (
    let i = direction === 1 ? 1 : result.length - 2;
    i >= 0 && i < result.length;
    i += direction
  ) {
    if (selected.has(result[i]) && !selected.has(result[i - direction]))
      [result[i], result[i - direction]] = [result[i - direction], result[i]];
  }
  return result;
}
