/**
 * Settings store — manages typography and layout preferences.
 * Persists settings to localStorage and applies them globally on change.
 */
import { create } from "zustand";
import { applySettings, DEFAULT_SETTINGS, type Settings } from "../lib/settings";

const STORAGE_KEY = "helm-settings";

/**
 * Load settings from localStorage, merging with defaults if partially saved.
 * Returns default settings if nothing is saved or if JSON parsing fails.
 * @internal
 */
function loadPersistedSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * Settings store state and actions.
 */
interface SettingsStore {
  /** Current settings */
  settings: Settings;
  /** Merge partial settings and persist + apply globally */
  updateSettings: (patch: Partial<Settings>) => void;
  /** Restore default settings */
  resetSettings: () => void;
}

/**
 * Global settings store using Zustand.
 * Persists settings to localStorage and applies them immediately on change.
 */
export const useSettingsStore = create<SettingsStore>(() => {
  const initial = loadPersistedSettings();
  applySettings(initial);

  return {
    settings: initial,
    updateSettings: (patch) => {
      useSettingsStore.setState((state) => {
        const next = { ...state.settings, ...patch };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        applySettings(next);
        return { settings: next };
      });
    },
    resetSettings: () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
      applySettings(DEFAULT_SETTINGS);
      useSettingsStore.setState({ settings: DEFAULT_SETTINGS });
    },
  };
});
