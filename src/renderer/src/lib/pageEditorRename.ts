export type PageRenameRule = {
  kind:
    | "number"
    | "replace"
    | "insert"
    | "remove"
    | "list"
    | "template"
    | "trim"
    | "case"
    | "pad";
  text: string;
  replacement: string;
  position: "prefix" | "suffix" | "at" | "whole";
  start: number;
  step: number;
  padding: number;
  count: number;
  sensitive: boolean;
  all: boolean;
  regex: boolean;
  upper: boolean;
};

export const DEFAULT_PAGE_RENAME_RULE: PageRenameRule = {
  kind: "number",
  text: "",
  replacement: "",
  position: "prefix",
  start: 1,
  step: 1,
  padding: 3,
  count: 0,
  sensitive: false,
  all: true,
  regex: false,
  upper: false,
};

export function renamePageValues(
  values: readonly string[],
  rule: PageRenameRule,
  context: { work: string; chapter: string },
): string[] {
  if (
    ![rule.start, rule.step, rule.padding, rule.count].every(
      Number.isSafeInteger,
    ) ||
    rule.padding < 1 ||
    rule.padding > 20 ||
    rule.count < 0
  )
    throw new Error("number");
  if (rule.kind === "list") {
    const lines = rule.text
      .replace(/\r\n?/g, "\n")
      .replace(/\n$/, "")
      .split("\n");
    if (lines.length !== values.length) throw new Error("listCount");
    return lines;
  }
  const expression =
    rule.kind === "replace" && rule.regex
      ? new RegExp(
          rule.text,
          `${rule.all ? "g" : ""}${rule.sensitive ? "" : "i"}u`,
        )
      : null;
  return values.map((value, index) => {
    const number = rule.start + index * rule.step;
    if (!Number.isSafeInteger(number)) throw new Error("number");
    const digits = String(number).padStart(rule.padding, "0");
    switch (rule.kind) {
      case "list":
        return value;
      case "number":
        return insert(value, digits, rule);
      case "insert":
        return insert(value, rule.text, rule);
      case "remove":
        return removeText(value, rule);
      case "replace":
        return replaceText(value, rule, expression);
      case "template":
        return rule.text.replace(
          /\{(work|chapter|name|number)\}/g,
          (_, key: string) =>
            ({
              work: context.work,
              chapter: context.chapter,
              name: value,
              number: digits,
            })[key as "work"],
        );
      case "trim":
        return value.trim().replace(/\s+/gu, " ");
      case "case":
        return rule.upper
          ? value.replace(/[a-z]/g, (c) => c.toUpperCase())
          : value.replace(/[A-Z]/g, (c) => c.toLowerCase());
      case "pad":
        return value.replace(/\d+/g, (n) => n.padStart(rule.padding, "0"));
    }
  });
}

function insert(value: string, text: string, rule: PageRenameRule): string {
  if (rule.position === "whole") return text;
  if (rule.position === "prefix") return text + value;
  if (rule.position === "suffix") return value + text;
  const chars = Array.from(value);
  return (
    chars.slice(0, rule.count).join("") +
    text +
    chars.slice(rule.count).join("")
  );
}

function removeText(value: string, rule: PageRenameRule): string {
  if (rule.position === "whole") return value.split(rule.text).join("");
  const chars = Array.from(value);
  return (
    rule.position === "suffix"
      ? chars.slice(0, Math.max(0, chars.length - rule.count))
      : chars.slice(rule.count)
  ).join("");
}
function replaceText(
  value: string,
  rule: PageRenameRule,
  expression: RegExp | null,
): string {
  if (!rule.text) throw new Error("search");
  const pattern =
    expression ??
    new RegExp(
      rule.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      `${rule.all ? "g" : ""}${rule.sensitive ? "" : "i"}u`,
    );
  return expression
    ? value.replace(pattern, rule.replacement)
    : value.replace(pattern, () => rule.replacement);
}
