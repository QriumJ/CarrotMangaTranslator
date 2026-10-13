import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = ["palette.css", "foundations.css"]
  .map((name) => readFileSync(join("src/renderer/src/styles", name), "utf8"))
  .join("\n");
const tokens = new Map(
  [...source.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((match) => [
    match[1],
    match[2].trim(),
  ]),
);

describe("application palette contract", () => {
  it("keeps colour values in the shared palette, with no missing or cyclic aliases", () => {
    for (const [name, value] of tokens) {
      if (!name.startsWith("--palette-")) {
        expect(value, name).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(\s*\d/i);
      }
      visit(name, []);
    }
  });

  it("preserves the accent for selection and focus across shared controls", () => {
    expect(tokens.get("--selected-edge")).toBe("var(--accent-bd)");
    expect(tokens.get("--selected-surface")).toContain("var(--accent)");
    expect(tokens.get("--selected-surface-hover")).toContain("var(--accent)");
    expect(tokens.get("--focus")).toBe("var(--accent-bd)");
  });

  it("retains distinct status roles instead of turning them all grey", () => {
    const colors = ["info", "success", "warning", "danger"].map((role) =>
      color(`--${role}-text`),
    );
    expect(new Set(colors.map(String)).size).toBe(4);
    for (const rgb of colors)
      expect(Math.max(...rgb) - Math.min(...rgb)).toBeGreaterThan(20);
  });

  it("keeps rotating arcs distinct from their tracks and notification dots visible", () => {
    for (const track of [
      "--status-dock-button-running-status-dock-indicator-border",
      "--status-dock-button-running-status-dock-indicator-border-color",
    ]) {
      expect(contrast(color("--info-bd"), color(track))).toBeGreaterThanOrEqual(
        3,
      );
    }
    for (const dot of [
      "--status-dock-button-unread-status-dock-indicator-background",
      "--status-dock-button-partial-status-dock-indicator-background",
    ]) {
      expect(contrast(color(dot), color("--bg-panel"))).toBeGreaterThanOrEqual(
        3,
      );
    }
    expect(
      contrast(
        color("--canvas-contrast-light"),
        color("--page-image-loading-spinner-border"),
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  it("keeps readable text and visible selection indicators on application surfaces", () => {
    for (const background of [
      "--bg-panel",
      "--bg-modal",
      "--bg-elevated",
      "--selected-surface",
      "--selected-surface-hover",
    ]) {
      for (const foreground of [
        "--text",
        "--text-dim",
        "--info-text",
        "--success-text",
        "--warning-text",
        "--danger-text",
      ]) {
        expect(
          contrast(color(foreground), color(background)),
          `${foreground} / ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(
        contrast(color("--selected-edge"), color(background)),
        background,
      ).toBeGreaterThanOrEqual(3);
    }
    for (const background of ["--accent", "--accent-hover", "--danger"]) {
      expect(
        contrast(color("--accent-text"), color(background)),
        background,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

function visit(name: string, path: string[]): void {
  expect(path, `cycle at ${name}`).not.toContain(name);
  expect(tokens.has(name), `missing ${name}`).toBe(true);
  for (const match of (tokens.get(name) ?? "").matchAll(
    /var\(\s*(--[\w-]+)/g,
  )) {
    visit(match[1], [...path, name]);
  }
}

function color(name: string): number[] {
  const value = tokens.get(name);
  if (!value) throw new Error(`Missing color: ${name}`);
  if (/^#[\da-f]{6}$/i.test(value)) {
    return [1, 3, 5].map((offset) =>
      Number.parseInt(value.slice(offset, offset + 2), 16),
    );
  }
  const refs = [...value.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map(
    (match) => match[1],
  );
  if (value.startsWith("rgb(")) {
    const opacity = value.match(/\/\s*([\d.]+)%/);
    if (!opacity) throw new Error(`Missing color opacity: ${name}`);
    const amount = Number(opacity[1]) / 100;
    const backdrop = color("--bg-panel");
    return color(refs[0]).map(
      (channel, index) => channel * amount + backdrop[index] * (1 - amount),
    );
  }
  if (value.startsWith("color-mix")) {
    const percentage = value.match(/([\d.]+)%/);
    if (!percentage) throw new Error(`Missing mix percentage: ${name}`);
    const amount = Number(percentage[1]) / 100;
    const a = color(refs[0]);
    const b = color(refs[1]);
    return a.map(
      (channel, index) => channel * amount + b[index] * (1 - amount),
    );
  }
  if (refs.length === 1) return color(refs[0]);
  throw new Error(`Unsupported color: ${name}=${value}`);
}

function contrast(a: number[], b: number[]): number {
  const values = [a, b].map((rgb) =>
    rgb.reduce((sum, channel, index) => {
      const value = channel / 255;
      return (
        sum +
        (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) *
          [0.2126, 0.7152, 0.0722][index]
      );
    }, 0),
  );
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}
