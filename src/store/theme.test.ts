import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useThemeStore } from "./theme";
import { THEMES } from "../lib/themes";

beforeEach(() => {
  localStorage.clear();
  useThemeStore.setState({ theme: THEMES[0] });
});

describe("useThemeStore", () => {
  it("initial theme is midnight (THEMES[0])", () => {
    const { result } = renderHook(() => useThemeStore());
    expect(result.current.theme.id).toBe("midnight");
  });

  it("setTheme - switches to named theme", () => {
    const { result } = renderHook(() => useThemeStore());
    act(() => {
      result.current.setTheme("light");
    });
    expect(result.current.theme.id).toBe("light");
    expect(result.current.theme.name).toBe("Light");
  });

  it("setTheme - persists to localStorage", () => {
    const { result } = renderHook(() => useThemeStore());
    act(() => {
      result.current.setTheme("dracula");
    });
    expect(localStorage.getItem("helm-theme")).toBe("dracula");
  });

  it("setTheme - applies CSS vars", () => {
    const { result } = renderHook(() => useThemeStore());
    const lightTheme = THEMES.find((t) => t.id === "light")!;
    act(() => {
      result.current.setTheme("light");
    });
    expect(
      document.documentElement.style.getPropertyValue("--color-bg")
    ).toBe(lightTheme.bg);
  });

  it("setTheme - unknown id falls back to THEMES[0]", () => {
    const { result } = renderHook(() => useThemeStore());
    act(() => {
      result.current.setTheme("nonexistent");
    });
    expect(result.current.theme.id).toBe("midnight");
  });

  it("setTheme - all 6 theme IDs work", () => {
    const { result } = renderHook(() => useThemeStore());
    for (const theme of THEMES) {
      act(() => {
        result.current.setTheme(theme.id);
      });
      expect(result.current.theme.id).toBe(theme.id);
    }
  });
});
