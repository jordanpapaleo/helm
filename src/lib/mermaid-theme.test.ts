import { describe, expect, it } from "vitest";
import { mermaidThemeVariables, oklchToHex } from "./mermaid-theme";
import { THEMES } from "./themes";

describe("oklchToHex", () => {
  it("converts the achromatic extremes", () => {
    expect(oklchToHex("oklch(100% 0 0)")).toBe("#ffffff");
    expect(oklchToHex("oklch(0% 0 0)")).toBe("#000000");
  });

  it("converts a saturated colour to its sRGB equivalent", () => {
    // Reference value for pure sRGB red.
    expect(oklchToHex("oklch(62.8% 0.2577 29.23)")).toBe("#ff0000");
  });

  it("accepts unitless lightness, leading-dot numbers, deg and alpha", () => {
    expect(oklchToHex("oklch(1 0 0)")).toBe("#ffffff");
    expect(oklchToHex("oklch(62.8% .2577 29.23deg / 0.5)")).toBe("#ff0000");
  });

  it("clamps out-of-gamut colours instead of producing invalid hex", () => {
    expect(oklchToHex("oklch(90% 0.4 150)")).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("returns null for anything it cannot parse", () => {
    expect(oklchToHex("rebeccapurple")).toBeNull();
    expect(oklchToHex("oklch(bad)")).toBeNull();
  });
});

describe("mermaidThemeVariables", () => {
  it("maps every built-in theme to hex colours mermaid can parse", () => {
    for (const theme of THEMES) {
      const vars = mermaidThemeVariables(theme);
      for (const [key, value] of Object.entries(vars)) {
        if (key === "darkMode" || key === "fontFamily") continue;
        expect(value, `${theme.id}.${key}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("follows the theme's colour scheme", () => {
    const light = THEMES.find((t) => t.colorScheme === "light");
    const dark = THEMES.find((t) => t.colorScheme === "dark");
    if (!light || !dark) throw new Error("expected a light and a dark theme");
    expect(mermaidThemeVariables(light).darkMode).toBe(false);
    expect(mermaidThemeVariables(dark).darkMode).toBe(true);
  });

  it("uses the theme's base content colour for text", () => {
    const theme = THEMES[0];
    expect(mermaidThemeVariables(theme).primaryTextColor).toBe(oklchToHex(theme.baseContent));
  });
});
