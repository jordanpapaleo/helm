import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

/**
 * Helm themes set color tokens only. DaisyUI's `.status` dot takes its corner
 * radius from `--radius-selector`, so without Helm's own value it renders as a
 * square. jsdom does not resolve custom properties, so this reads the shipped
 * stylesheets directly.
 */
const helmCss = readFileSync(`${process.cwd()}/src/styles/globals.css`, "utf8");
const daisyStatusCss = readFileSync(
  `${process.cwd()}/node_modules/daisyui/components/status.css`,
  "utf8",
);

function toPx(value: string): number {
  const match = value.match(/^([\d.]+)(px|rem)$/);
  if (!match) throw new Error(`unexpected length ${value}`);
  return Number(match[1]) * (match[2] === "rem" ? 16 : 1);
}

it("gives the DaisyUI status dot a radius that makes it a circle at every size", () => {
  expect(daisyStatusCss).toMatch(/\.status\{[\s\S]*?border-radius:var\(--radius-selector\)/);
  const sizes = [...daisyStatusCss.matchAll(/width:([\d.]+rem)/g)].map((match) => toPx(match[1]));
  expect(sizes.length).toBeGreaterThan(0);

  const rule = helmCss.match(/(?:^|\n)\.status \{([^}]*)\}/);
  expect(rule, "globals.css needs a .status rule").not.toBeNull();
  const radius = rule?.[1].match(/--radius-selector:\s*([\d.]+(?:px|rem))/)?.[1];
  expect(radius, ".status must set --radius-selector").toBeDefined();
  expect(toPx(radius as string)).toBeGreaterThanOrEqual(Math.max(...sizes) / 2);
});
