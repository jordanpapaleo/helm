/**
 * Theme definition and application utilities.
 * Follows the DaisyUI color token convention — each theme defines a complete
 * set of semantic CSS custom properties applied via applyTheme().
 */

/**
 * Complete theme definition following DaisyUI's color token structure.
 * Field names mirror DaisyUI's CSS variable naming convention
 * (e.g. base100 → --color-base-100, neutralContent → --color-neutral-content).
 */
export interface Theme {
  id: string;
  name: string;
  /** Color shown in theme picker dot */
  swatch: string;

  // ── Base surfaces ──────────────────────────────────────────────
  /** Page / app background */
  base100: string;
  /** Panels, cards — first elevation */
  base200: string;
  /** Deeper surfaces — second elevation */
  base300: string;
  /** Default text on base surfaces */
  baseContent: string;

  // ── Neutral ────────────────────────────────────────────────────
  /** Borders, dividers, non-saturated UI elements */
  neutral: string;
  /** Muted / secondary text */
  neutralContent: string;

  // ── Primary ────────────────────────────────────────────────────
  primary: string;
  primaryContent: string;

  // ── Accent ─────────────────────────────────────────────────────
  accent: string;
  accentContent: string;

  // ── Status colors ──────────────────────────────────────────────
  info: string;
  infoContent: string;
  success: string;
  successContent: string;
  warning: string;
  warningContent: string;
  error: string;
  errorContent: string;
}

export const THEMES: Theme[] = [
  {
    id: "midnight",
    name: "Midnight",
    swatch: "#0a84ff",
    base100: "#1c1c1e",
    base200: "#2c2c2e",
    base300: "#111113",
    baseContent: "#f2f2f7",
    neutral: "#3a3a3c",
    neutralContent: "#8e8e93",
    primary: "#0a84ff",
    primaryContent: "#ffffff",
    accent: "#0a84ff",
    accentContent: "#ffffff",
    info: "#0a84ff",
    infoContent: "#ffffff",
    success: "#30d158",
    successContent: "#000000",
    warning: "#ff9f0a",
    warningContent: "#000000",
    error: "#ff453a",
    errorContent: "#ffffff",
  },
  {
    id: "light",
    name: "Light",
    swatch: "#007aff",
    base100: "#f5f5f7",
    base200: "#ffffff",
    base300: "#e8e8ed",
    baseContent: "#1c1c1e",
    neutral: "#d1d1d6",
    neutralContent: "#6e6e73",
    primary: "#007aff",
    primaryContent: "#ffffff",
    accent: "#007aff",
    accentContent: "#ffffff",
    info: "#007aff",
    infoContent: "#ffffff",
    success: "#28cd41",
    successContent: "#ffffff",
    warning: "#ff9500",
    warningContent: "#ffffff",
    error: "#ff3b30",
    errorContent: "#ffffff",
  },
  {
    id: "dracula",
    name: "Dracula",
    swatch: "#ff79c6",
    base100: "#282a36",
    base200: "#44475a",
    base300: "#21222c",
    baseContent: "#f8f8f2",
    neutral: "#6272a4",
    neutralContent: "#6272a4",
    primary: "#ff79c6",
    primaryContent: "#282a36",
    accent: "#ff79c6",
    accentContent: "#282a36",
    info: "#8be9fd",
    infoContent: "#282a36",
    success: "#50fa7b",
    successContent: "#282a36",
    warning: "#ffb86c",
    warningContent: "#282a36",
    error: "#ff5555",
    errorContent: "#ffffff",
  },
  {
    id: "nord",
    name: "Nord",
    swatch: "#88c0d0",
    base100: "#2e3440",
    base200: "#3b4252",
    base300: "#242933",
    baseContent: "#eceff4",
    neutral: "#434c5e",
    neutralContent: "#7b88a1",
    primary: "#88c0d0",
    primaryContent: "#2e3440",
    accent: "#88c0d0",
    accentContent: "#2e3440",
    info: "#81a1c1",
    infoContent: "#2e3440",
    success: "#a3be8c",
    successContent: "#2e3440",
    warning: "#ebcb8b",
    warningContent: "#2e3440",
    error: "#bf616a",
    errorContent: "#ffffff",
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    swatch: "#cba6f7",
    base100: "#1e1e2e",
    base200: "#313244",
    base300: "#181825",
    baseContent: "#cdd6f4",
    neutral: "#45475a",
    neutralContent: "#a6adc8",
    primary: "#cba6f7",
    primaryContent: "#1e1e2e",
    accent: "#cba6f7",
    accentContent: "#1e1e2e",
    info: "#89b4fa",
    infoContent: "#1e1e2e",
    success: "#a6e3a1",
    successContent: "#1e1e2e",
    warning: "#f9e2af",
    warningContent: "#1e1e2e",
    error: "#f38ba8",
    errorContent: "#1e1e2e",
  },
  {
    id: "tokyo",
    name: "Tokyo Night",
    swatch: "#7aa2f7",
    base100: "#1a1b2e",
    base200: "#24283b",
    base300: "#13141f",
    baseContent: "#c0caf5",
    neutral: "#414868",
    neutralContent: "#565f89",
    primary: "#7aa2f7",
    primaryContent: "#1a1b2e",
    accent: "#7aa2f7",
    accentContent: "#1a1b2e",
    info: "#7aa2f7",
    infoContent: "#1a1b2e",
    success: "#9ece6a",
    successContent: "#1a1b2e",
    warning: "#e0af68",
    warningContent: "#1a1b2e",
    error: "#f7768e",
    errorContent: "#ffffff",
  },
];

/**
 * Apply a theme globally by setting CSS custom properties on :root.
 * Called on theme selection and on app startup to restore the saved theme.
 *
 * @param theme - The theme to apply
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  // Base surfaces
  root.style.setProperty("--color-base-100", theme.base100);
  root.style.setProperty("--color-base-200", theme.base200);
  root.style.setProperty("--color-base-300", theme.base300);
  root.style.setProperty("--color-base-content", theme.baseContent);

  // Neutral
  root.style.setProperty("--color-neutral", theme.neutral);
  root.style.setProperty("--color-neutral-content", theme.neutralContent);

  // Primary
  root.style.setProperty("--color-primary", theme.primary);
  root.style.setProperty("--color-primary-content", theme.primaryContent);

  // Accent
  root.style.setProperty("--color-accent", theme.accent);
  root.style.setProperty("--color-accent-content", theme.accentContent);

  // Status
  root.style.setProperty("--color-info", theme.info);
  root.style.setProperty("--color-info-content", theme.infoContent);
  root.style.setProperty("--color-success", theme.success);
  root.style.setProperty("--color-success-content", theme.successContent);
  root.style.setProperty("--color-warning", theme.warning);
  root.style.setProperty("--color-warning-content", theme.warningContent);
  root.style.setProperty("--color-error", theme.error);
  root.style.setProperty("--color-error-content", theme.errorContent);
}
