import { describe, expect, it } from "vitest";
import {
  applySettings,
  DEFAULT_SETTINGS,
  NOTE_CONTENT_STYLE,
  normalizeSettings,
  noteFontFamily,
} from "./settings";

describe("note font", () => {
  it("defaults to the system face notes already use", () => {
    expect(DEFAULT_SETTINGS.noteFont).toBe("system");
    expect(noteFontFamily("system")).toBe("var(--font-sans)");
    expect(NOTE_CONTENT_STYLE).toContain("font-family: var(--editor-font-family)");
  });

  it("keeps a saved font and drops an unknown one", () => {
    const saved = normalizeSettings({ noteFont: "serif", fontSize: 18 });
    expect(saved.noteFont).toBe("serif");
    expect(saved.fontSize).toBe(18);
    expect(saved.lineHeight).toBe(DEFAULT_SETTINGS.lineHeight);

    expect(normalizeSettings({ fontSize: 18 }).noteFont).toBe("system");
    expect(normalizeSettings({ noteFont: "comic-sans" }).noteFont).toBe("system");
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("applies the font as a note-text custom property", () => {
    applySettings({ ...DEFAULT_SETTINGS, noteFont: "mono" });
    expect(document.documentElement.style.getPropertyValue("--editor-font-family")).toBe(
      noteFontFamily("mono"),
    );

    applySettings(DEFAULT_SETTINGS);
    expect(document.documentElement.style.getPropertyValue("--editor-font-family")).toBe(
      "var(--font-sans)",
    );
  });
});
