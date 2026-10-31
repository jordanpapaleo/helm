import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings, noteFontFamily } from "../lib/settings";
import { useSettingsStore } from "./settings";

beforeEach(() => {
  localStorage.clear();
  act(() => {
    useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
  });
});

describe("useSettingsStore", () => {
  describe("updateSettings", () => {
    it("partial update: updates only the specified field", () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.updateSettings({ fontSize: 20 });
      });
      expect(result.current.settings.fontSize).toBe(20);
      expect(result.current.settings.lineHeight).toBe(DEFAULT_SETTINGS.lineHeight);
      expect(result.current.settings.autocompleteWikiLinks).toBe(
        DEFAULT_SETTINGS.autocompleteWikiLinks,
      );
      expect(result.current.settings.autoSaveOnEdit).toBe(DEFAULT_SETTINGS.autoSaveOnEdit);
      expect(result.current.settings.pinnedNotesFloat).toBe(DEFAULT_SETTINGS.pinnedNotesFloat);
      expect(result.current.settings.showNoteCountOnTags).toBe(
        DEFAULT_SETTINGS.showNoteCountOnTags,
      );
      expect(result.current.settings.showArchivedNotes).toBe(DEFAULT_SETTINGS.showArchivedNotes);
    });

    it("keeps Projects off by default and persists the opt-in", () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.settings.enableProjects).toBe(false);
      act(() => {
        result.current.updateSettings({ enableProjects: true });
      });
      expect(result.current.settings.enableProjects).toBe(true);
      const stored = JSON.parse(localStorage.getItem("helm-settings") ?? "{}");
      expect(stored.enableProjects).toBe(true);

      localStorage.setItem("helm-settings", JSON.stringify({ fontSize: 18 }));
      const reloaded = JSON.parse(localStorage.getItem("helm-settings") ?? "{}");
      expect(reloaded.enableProjects).toBeUndefined();
      act(() => {
        useSettingsStore.setState({
          settings: {
            ...DEFAULT_SETTINGS,
            ...JSON.parse(localStorage.getItem("helm-settings") ?? "{}"),
          },
        });
      });
      expect(result.current.settings.enableProjects).toBe(false);
    });

    it("persists show archived notes, which defaults to off", () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.settings.showArchivedNotes).toBe(false);
      act(() => {
        result.current.updateSettings({ showArchivedNotes: true });
      });
      expect(result.current.settings.showArchivedNotes).toBe(true);
      const stored = JSON.parse(localStorage.getItem("helm-settings") ?? "{}");
      expect(stored.showArchivedNotes).toBe(true);
    });

    it("persists to localStorage after update", () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.updateSettings({ fontSize: 20 });
      });
      const stored = JSON.parse(localStorage.getItem("helm-settings") ?? "{}");
      expect(stored.fontSize).toBe(20);
    });

    it("applies CSS custom property after update", () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.updateSettings({ fontSize: 20 });
      });
      expect(document.documentElement.style.getPropertyValue("--editor-font-size")).toBe("20px");
    });

    it("round-trips the note font through localStorage and the note-text property", () => {
      const { result } = renderHook(() => useSettingsStore());
      expect(result.current.settings.noteFont).toBe("system");
      act(() => {
        result.current.updateSettings({ noteFont: "serif" });
      });
      expect(result.current.settings.noteFont).toBe("serif");
      expect(result.current.settings.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
      const stored = JSON.parse(localStorage.getItem("helm-settings") ?? "null");
      expect(normalizeSettings(stored).noteFont).toBe("serif");
      expect(document.documentElement.style.getPropertyValue("--editor-font-family")).toBe(
        noteFontFamily("serif"),
      );
    });
  });

  describe("resetSettings", () => {
    it("restores default settings after update", () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.updateSettings({ fontSize: 20 });
      });
      expect(result.current.settings.fontSize).toBe(20);
      act(() => {
        result.current.resetSettings();
      });
      expect(result.current.settings.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    });

    it("writes DEFAULT_SETTINGS to localStorage after reset", () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.updateSettings({ fontSize: 20 });
      });
      act(() => {
        result.current.resetSettings();
      });
      const stored = JSON.parse(localStorage.getItem("helm-settings") ?? "{}");
      expect(stored).toEqual(DEFAULT_SETTINGS);
    });

    it("applies default CSS after reset", () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.updateSettings({ fontSize: 20 });
      });
      expect(document.documentElement.style.getPropertyValue("--editor-font-size")).toBe("20px");
      act(() => {
        result.current.resetSettings();
      });
      expect(document.documentElement.style.getPropertyValue("--editor-font-size")).toBe("16px");
    });

    it("clears a custom note font", () => {
      const { result } = renderHook(() => useSettingsStore());
      act(() => {
        result.current.updateSettings({ noteFont: "mono" });
      });
      act(() => {
        result.current.resetSettings();
      });
      expect(result.current.settings.noteFont).toBe(DEFAULT_SETTINGS.noteFont);
      const stored = JSON.parse(localStorage.getItem("helm-settings") ?? "null");
      expect(stored.noteFont).toBe("system");
      expect(document.documentElement.style.getPropertyValue("--editor-font-family")).toBe(
        noteFontFamily("system"),
      );
    });
  });
});
