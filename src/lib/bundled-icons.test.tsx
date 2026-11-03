import { readFileSync } from "node:fs";
import { Icon } from "@iconify/react";
import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BUNDLED_ICON_NAMES, bundledIconCollection, registerBundledIcons } from "./bundled-icons";

const sources = import.meta.glob("/src/**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** `uil:` names in application source. Tests are excluded so this file can render icons. */
function iconNamesInSource(): string[] {
  const names = new Set<string>();
  const pattern = /uil:([a-z0-9-]+)/g;
  for (const [path, text] of Object.entries(sources)) {
    if (path.includes(".test.")) continue;
    for (const match of text.matchAll(pattern)) names.add(match[1]);
  }
  return [...names].sort();
}

it("bundles every uil icon the app names", () => {
  const bundled = new Set<string>(BUNDLED_ICON_NAMES);
  const missing = iconNamesInSource().filter((name) => !bundled.has(name));
  expect(missing, "add these names to BUNDLED_ICON_NAMES so they render offline").toEqual([]);
});

it("stores SVG for every bundled name", () => {
  const icons = bundledIconCollection().icons;
  for (const name of BUNDLED_ICON_NAMES) {
    expect(icons[name]?.body, name).toMatch(/<(path|circle|rect|polygon|g)\b/);
  }
});

it("draws every used icon while the Iconify API is unreachable", () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  registerBundledIcons();
  const names = iconNamesInSource();
  const view = render(names.map((name) => <Icon key={name} icon={`uil:${name}`} />));

  const svgs = view.container.querySelectorAll("svg");
  expect(svgs).toHaveLength(names.length);
  for (const svg of svgs) {
    expect(svg.innerHTML).toMatch(/<(path|circle|rect|polygon|g)\b/);
  }
  expect(fetchSpy).not.toHaveBeenCalled();
  view.unmount();
  fetchSpy.mockRestore();
});

it("registers the bundle before the app renders", () => {
  const main = readFileSync(`${process.cwd()}/src/main.tsx`, "utf8");
  const registerAt = main.indexOf("registerBundledIcons()");
  const renderAt = main.indexOf("createRoot");
  expect(registerAt).toBeGreaterThanOrEqual(0);
  expect(registerAt).toBeLessThan(renderAt);
});
