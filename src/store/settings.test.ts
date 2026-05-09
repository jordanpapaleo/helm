import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../lib/settings";
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
  });
});
