import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTheme, injectThemeStyles, THEMES, type Theme } from "./themes";

// ---------------------------------------------------------------------------
// THEMES array — structure and completeness
// ---------------------------------------------------------------------------

describe("THEMES", () => {
  it("contains at least one theme", () => {
    expect(THEMES.length).toBeGreaterThan(0);
  });

  it("includes the required light and dark base themes", () => {
    const ids = THEMES.map((t) => t.id);
    expect(ids).toContain("light");
    expect(ids).toContain("dark");
  });

  it("every theme has a unique id", () => {
    const ids = THEMES.map((t) => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every theme has a non-empty name", () => {
    for (const theme of THEMES) {
      expect(theme.name.length).toBeGreaterThan(0);
    }
  });

  it("every theme has colorScheme of 'light' or 'dark'", () => {
    for (const theme of THEMES) {
      expect(["light", "dark"]).toContain(theme.colorScheme);
    }
  });

  it("every theme has a non-empty swatch", () => {
    for (const theme of THEMES) {
      expect(theme.swatch.length).toBeGreaterThan(0);
    }
  });

  const requiredColorFields: (keyof Theme)[] = [
    "base100",
    "base200",
    "base300",
    "baseContent",
    "neutral",
    "neutralContent",
    "primary",
    "primaryContent",
    "secondary",
    "secondaryContent",
    "accent",
    "accentContent",
    "info",
    "infoContent",
    "success",
    "successContent",
    "warning",
    "warningContent",
    "error",
    "errorContent",
  ];

  it("every theme defines all required color fields as non-empty strings", () => {
    for (const theme of THEMES) {
      for (const field of requiredColorFields) {
        const value = theme[field] as string;
        expect(
          typeof value === "string" && value.length > 0,
          `theme "${theme.id}" is missing or has empty field "${field}"`,
        ).toBe(true);
      }
    }
  });

  it("'light' theme has colorScheme 'light'", () => {
    const lightTheme = THEMES.find((t) => t.id === "light");
    expect(lightTheme?.colorScheme).toBe("light");
  });

  it("'dark' theme has colorScheme 'dark'", () => {
    const darkTheme = THEMES.find((t) => t.id === "dark");
    expect(darkTheme?.colorScheme).toBe("dark");
  });
});

// ---------------------------------------------------------------------------
// injectThemeStyles — DOM injection
// ---------------------------------------------------------------------------

describe("injectThemeStyles", () => {
  afterEach(() => {
    // Clean up any injected style element after each test
    document.getElementById("helm-themes")?.remove();
  });

  it("creates a <style> element with id 'helm-themes'", () => {
    injectThemeStyles();
    const el = document.getElementById("helm-themes");
    expect(el).not.toBeNull();
    expect(el?.tagName.toLowerCase()).toBe("style");
  });

  it("the injected CSS contains every theme id as a data-theme selector", () => {
    injectThemeStyles();
    const el = document.getElementById("helm-themes") as HTMLStyleElement;
    for (const theme of THEMES) {
      expect(el.textContent).toContain(`[data-theme="${theme.id}"]`);
    }
  });

  it("the injected CSS contains expected CSS custom properties", () => {
    injectThemeStyles();
    const el = document.getElementById("helm-themes") as HTMLStyleElement;
    const css = el.textContent ?? "";
    expect(css).toContain("--color-primary");
    expect(css).toContain("--color-base-100");
    expect(css).toContain("--color-accent");
    expect(css).toContain("--color-error");
  });

  it("calling injectThemeStyles a second time reuses the existing element", () => {
    injectThemeStyles();
    injectThemeStyles();
    const elements = document.querySelectorAll("#helm-themes");
    expect(elements.length).toBe(1);
  });

  it("the injected CSS includes the color-scheme property for each theme", () => {
    injectThemeStyles();
    const el = document.getElementById("helm-themes") as HTMLStyleElement;
    const css = el.textContent ?? "";
    expect(css).toContain("color-scheme: light");
    expect(css).toContain("color-scheme: dark");
  });
});

// ---------------------------------------------------------------------------
// applyTheme — sets data-theme attribute on :root
// ---------------------------------------------------------------------------

describe("applyTheme", () => {
  beforeEach(() => {
    // Clear attribute before each test
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("sets data-theme on <html> to the theme id", () => {
    const theme = THEMES.find((t) => t.id === "dark");
    if (!theme) throw new Error("dark theme missing");
    applyTheme(theme);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("switches data-theme when called with a different theme", () => {
    const light = THEMES.find((t) => t.id === "light");
    const dark = THEMES.find((t) => t.id === "dark");
    if (!light || !dark) throw new Error("light or dark theme missing");
    applyTheme(light);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    applyTheme(dark);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("sets data-theme for every available theme without error", () => {
    for (const theme of THEMES) {
      expect(() => applyTheme(theme)).not.toThrow();
      expect(document.documentElement.getAttribute("data-theme")).toBe(theme.id);
    }
  });
});
