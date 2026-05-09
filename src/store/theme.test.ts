import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { THEMES } from "../lib/themes";
import { useThemeStore } from "./theme";

beforeEach(() => {
  localStorage.clear();
  useThemeStore.setState({ theme: THEMES[0] });
});

describe("useThemeStore", () => {
  it("initial theme is light (THEMES[0])", () => {
    const { result } = renderHook(() => useThemeStore());
    expect(result.current.theme.id).toBe("light");
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
      result.current.setTheme("light");
    });
    expect(localStorage.getItem("helm-theme")).toBe("light");
  });

  it("setTheme - sets data-theme attribute", () => {
    const { result } = renderHook(() => useThemeStore());
    act(() => {
      result.current.setTheme("light");
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("setTheme - unknown id falls back to THEMES[0]", () => {
    const { result } = renderHook(() => useThemeStore());
    act(() => {
      result.current.setTheme("nonexistent");
    });
    expect(result.current.theme.id).toBe("light");
  });

  it("setTheme - all theme IDs work", () => {
    const { result } = renderHook(() => useThemeStore());
    for (const theme of THEMES) {
      act(() => {
        result.current.setTheme(theme.id);
      });
      expect(result.current.theme.id).toBe(theme.id);
    }
  });
});
