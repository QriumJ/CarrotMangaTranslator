import {
  createConditionalPatternId,
  createConditionalPatternRepeat,
  type ConditionalPatternNodeV3,
  type ConditionalPatternRepeatV3,
  type ConditionalReplacementV3,
  type ConditionalTextMatcherV3,
} from "../../../shared/conditionalTextPattern";

export type PatternBuilderProps = {
  matcher: ConditionalTextMatcherV3;
  replacement?: ConditionalReplacementV3;
  sampleText?: string;
  onChangeMatcher: (matcher: ConditionalTextMatcherV3) => void;
  onChangeReplacement?: (replacement: ConditionalReplacementV3) => void;
  onSwitchToRaw?: (
    matcher: ConditionalTextMatcherV3,
    replacement?: ConditionalReplacementV3,
  ) => void;
  onSwitchToVisual?: (
    matcher: ConditionalTextMatcherV3,
    replacement?: ConditionalReplacementV3,
  ) => void;
};

const CHARACTER_LABELS: Record<
  Extract<ConditionalPatternNodeV3, { kind: "character" }>["character"],
  string
> = {
  number: "숫자",
  letter: "글자",
  whitespace: "공백",
  newline: "줄바꿈",
  any: "아무 글자",
};

export function createPatternNode(
  kind:
    | "literal"
    | "number"
    | "letter"
    | "whitespace"
    | "newline"
    | "any"
    | "choice"
    | "start"
    | "end"
    | "group",
): ConditionalPatternNodeV3 {
  const id = createConditionalPatternId(kind);
  if (kind === "start" || kind === "end") {
    return { id, kind: "boundary", boundary: kind };
  }
  const repeat = createConditionalPatternRepeat({
    ...(kind === "any" ? { min: 1, max: null, greedy: false } : {}),
  });
  if (kind === "literal") return { id, kind, text: "", repeat };
  if (kind === "choice") {
    return { id, kind, options: ["후보 1", "후보 2"], repeat };
  }
  if (kind === "group") {
    return {
      id,
      kind,
      repeat,
      nodes: [
        {
          id: createConditionalPatternId("literal"),
          kind: "literal",
          text: "",
          repeat: createConditionalPatternRepeat(),
        },
      ],
    };
  }
  return { id, kind: "character", character: kind, repeat };
}

export function patternNodeLabel(node: ConditionalPatternNodeV3): string {
  if (node.kind === "boundary") {
    return node.boundary === "start" ? "말풍선 처음" : "말풍선 끝";
  }
  if (node.kind === "character") return CHARACTER_LABELS[node.character];
  if (node.kind === "choice") return node.options.join(" 또는 ");
  if (node.kind === "group") return `묶음 ${node.nodes.length}개`;
  return node.text;
}

export function repeatPreset(repeat: ConditionalPatternRepeatV3): string {
  if (repeat.min === 1 && repeat.max === 1) return "once";
  if (repeat.min === 0 && repeat.max === 1) return "optional";
  if (repeat.min === 1 && repeat.max === null) return "oneOrMore";
  if (repeat.min === 0 && repeat.max === null) return "zeroOrMore";
  if (repeat.min === repeat.max) return "exact";
  return "range";
}

export function repeatFromPreset(
  preset: string,
  previous: ConditionalPatternRepeatV3,
): ConditionalPatternRepeatV3 {
  if (preset === "once") return { min: 1, max: 1, greedy: true };
  if (preset === "optional") return { min: 0, max: 1, greedy: true };
  if (preset === "oneOrMore") return { min: 1, max: null, greedy: true };
  if (preset === "zeroOrMore") return { min: 0, max: null, greedy: true };
  if (preset === "exact") {
    const count = Math.max(1, previous.min);
    return { min: count, max: count, greedy: true };
  }
  return {
    min: previous.min,
    max: previous.max === null ? Math.max(previous.min + 1, 2) : previous.max,
    greedy: true,
  };
}

export function repeatLabel(repeat: ConditionalPatternRepeatV3): string {
  const preset = repeatPreset(repeat);
  if (preset === "once") return "한 번";
  if (preset === "optional") return "있어도 됨";
  if (preset === "oneOrMore") return "1개 이상";
  if (preset === "zeroOrMore") return "여러 개";
  if (preset === "exact") return `${repeat.min}개`;
  return `${repeat.min}~${repeat.max ?? "∞"}개`;
}

export function isOnce(repeat: ConditionalPatternRepeatV3): boolean {
  return repeat.min === 1 && repeat.max === 1;
}

export function moveArrayItem<T>(
  items: T[],
  index: number,
  offset: -1 | 1,
): T[] {
  const target = index + offset;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function moveArrayItemTo<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}
