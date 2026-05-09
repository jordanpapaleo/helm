/**
 * Theme definition and application utilities.
 * Follows the DaisyUI color token convention — each theme defines a complete
 * set of semantic CSS custom properties applied via applyTheme().
 *
 * All color values use oklch() for perceptually uniform color interpolation,
 * which enables smooth color-mix() blending (borders, hover states, etc.)
 * across every theme. macOS Tahoe / WebKit is fully supported.
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
  /** Non-saturated UI elements */
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
    swatch: "oklch(62.4% 0.206 255.5)",
    base100: "oklch(22.7% 0.004 286)",
    base200: "oklch(29.4% 0.004 286)",
    base300: "oklch(17.9% 0.004 285.9)",
    baseContent: "oklch(96.3% 0.007 286)",
    neutral: "oklch(34.9% 0.003 286)",
    neutralContent: "oklch(64.8% 0.007 286)",
    primary: "oklch(62.4% 0.206 255.5)",
    primaryContent: "oklch(100% 0 0)",
    accent: "oklch(62.4% 0.206 255.5)",
    accentContent: "oklch(100% 0 0)",
    info: "oklch(62.4% 0.206 255.5)",
    infoContent: "oklch(100% 0 0)",
    success: "oklch(75.6% 0.208 147)",
    successContent: "oklch(0% 0 0)",
    warning: "oklch(78.2% 0.171 67.2)",
    warningContent: "oklch(0% 0 0)",
    error: "oklch(66.3% 0.224 28.3)",
    errorContent: "oklch(100% 0 0)",
  },
  {
    id: "light",
    name: "Light",
    swatch: "oklch(60.3% 0.218 257.4)",
    base100: "oklch(97.1% 0.003 285.7)",
    base200: "oklch(100% 0 0)",
    base300: "oklch(93.2% 0.007 286)",
    baseContent: "oklch(22.7% 0.004 286)",
    neutral: "oklch(86.2% 0.007 286)",
    neutralContent: "oklch(54% 0.008 286)",
    primary: "oklch(60.3% 0.218 257.4)",
    primaryContent: "oklch(100% 0 0)",
    accent: "oklch(60.3% 0.218 257.4)",
    accentContent: "oklch(100% 0 0)",
    info: "oklch(60.3% 0.218 257.4)",
    infoContent: "oklch(100% 0 0)",
    success: "oklch(74.1% 0.222 144.7)",
    successContent: "oklch(100% 0 0)",
    warning: "oklch(76.5% 0.175 62.6)",
    warningContent: "oklch(100% 0 0)",
    error: "oklch(65.4% 0.232 28.7)",
    errorContent: "oklch(100% 0 0)",
  },
  {
    id: "dracula",
    name: "Dracula",
    swatch: "oklch(75.5% 0.183 346.8)",
    base100: "oklch(28.8% 0.022 277.5)",
    base200: "oklch(40.3% 0.032 277.8)",
    base300: "oklch(25.5% 0.019 280.5)",
    baseContent: "oklch(97.7% 0.008 106.8)",
    neutral: "oklch(56% 0.08 270.1)",
    neutralContent: "oklch(56% 0.08 270.1)",
    primary: "oklch(75.5% 0.183 346.8)",
    primaryContent: "oklch(28.8% 0.022 277.5)",
    accent: "oklch(75.5% 0.183 346.8)",
    accentContent: "oklch(28.8% 0.022 277.5)",
    info: "oklch(88.3% 0.093 212.9)",
    infoContent: "oklch(28.8% 0.022 277.5)",
    success: "oklch(87.1% 0.219 148)",
    successContent: "oklch(28.8% 0.022 277.5)",
    warning: "oklch(83.4% 0.124 66.6)",
    warningContent: "oklch(28.8% 0.022 277.5)",
    error: "oklch(68.2% 0.206 24.4)",
    errorContent: "oklch(100% 0 0)",
  },
  {
    id: "nord",
    name: "Nord",
    swatch: "oklch(77.5% 0.062 217.5)",
    base100: "oklch(32.4% 0.023 264.2)",
    base200: "oklch(37.9% 0.029 266.5)",
    base300: "oklch(28% 0.02 264.2)",
    baseContent: "oklch(95.1% 0.008 260.8)",
    neutral: "oklch(41.6% 0.032 264.1)",
    neutralContent: "oklch(62.5% 0.041 263.5)",
    primary: "oklch(77.5% 0.062 217.5)",
    primaryContent: "oklch(32.4% 0.023 264.2)",
    accent: "oklch(77.5% 0.062 217.5)",
    accentContent: "oklch(32.4% 0.023 264.2)",
    info: "oklch(69.7% 0.059 248.7)",
    infoContent: "oklch(32.4% 0.023 264.2)",
    success: "oklch(76.8% 0.075 131.1)",
    successContent: "oklch(32.4% 0.023 264.2)",
    warning: "oklch(85.5% 0.089 84.1)",
    warningContent: "oklch(32.4% 0.023 264.2)",
    error: "oklch(60.6% 0.121 15.3)",
    errorContent: "oklch(100% 0 0)",
  },
  {
    id: "catppuccin",
    name: "Catppuccin",
    swatch: "oklch(78.7% 0.119 304.8)",
    base100: "oklch(24.3% 0.03 283.9)",
    base200: "oklch(32.4% 0.032 282)",
    base300: "oklch(21.6% 0.025 284.1)",
    baseContent: "oklch(87.9% 0.043 272.3)",
    neutral: "oklch(40.4% 0.032 280.1)",
    neutralContent: "oklch(75.1% 0.04 273.9)",
    primary: "oklch(78.7% 0.119 304.8)",
    primaryContent: "oklch(24.3% 0.03 283.9)",
    accent: "oklch(78.7% 0.119 304.8)",
    accentContent: "oklch(24.3% 0.03 283.9)",
    info: "oklch(76.6% 0.111 259.9)",
    infoContent: "oklch(24.3% 0.03 283.9)",
    success: "oklch(85.8% 0.109 142.8)",
    successContent: "oklch(24.3% 0.03 283.9)",
    warning: "oklch(91.9% 0.07 86.5)",
    warningContent: "oklch(24.3% 0.03 283.9)",
    error: "oklch(75.6% 0.13 2.7)",
    errorContent: "oklch(24.3% 0.03 283.9)",
  },
  {
    id: "tokyo",
    name: "Tokyo Night",
    swatch: "oklch(71.9% 0.132 264.2)",
    base100: "oklch(23.1% 0.037 280.8)",
    base200: "oklch(28.2% 0.036 274.7)",
    base300: "oklch(19.6% 0.022 280.1)",
    baseContent: "oklch(84.6% 0.061 274.8)",
    neutral: "oklch(40.9% 0.055 274.3)",
    neutralContent: "oklch(49.6% 0.068 274.4)",
    primary: "oklch(71.9% 0.132 264.2)",
    primaryContent: "oklch(23.1% 0.037 280.8)",
    accent: "oklch(71.9% 0.132 264.2)",
    accentContent: "oklch(23.1% 0.037 280.8)",
    info: "oklch(71.9% 0.132 264.2)",
    infoContent: "oklch(23.1% 0.037 280.8)",
    success: "oklch(79.5% 0.139 130.2)",
    successContent: "oklch(23.1% 0.037 280.8)",
    warning: "oklch(78.4% 0.106 75.4)",
    warningContent: "oklch(23.1% 0.037 280.8)",
    error: "oklch(72.3% 0.159 10.3)",
    errorContent: "oklch(100% 0 0)",
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
