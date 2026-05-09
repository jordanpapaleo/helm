/**
 * Theme store — manages color theme selection and persistence.
 * Loads theme from localStorage on startup and applies it immediately.
 */
import { create } from "zustand";
import { applyTheme, injectThemeStyles, THEMES, type Theme } from "../lib/themes";

const STORAGE_KEY = "helm-theme";

/**
 * Load the theme from localStorage, or return the default (first) theme.
 * @internal
 */
function getInitialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY);
  return THEMES.find((t) => t.id === saved) ?? THEMES[0];
}

/**
 * Theme store state and actions.
 */
interface ThemeStore {
  /** Currently active theme */
  theme: Theme;
  /** Switch to a different theme by ID */
  setTheme: (id: string) => void;
}

/**
 * Global theme store using Zustand.
 * Persists theme choice to localStorage and applies it on store init and selection.
 */
export const useThemeStore = create<ThemeStore>((set) => {
  injectThemeStyles();
  const initial = getInitialTheme();
  applyTheme(initial);
  return {
    theme: initial,
    setTheme: (id) => {
      const theme = THEMES.find((t) => t.id === id) ?? THEMES[0];
      localStorage.setItem(STORAGE_KEY, id);
      applyTheme(theme);
      set({ theme });
    },
  };
});
