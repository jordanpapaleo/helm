import type { Theme } from "./themes";

const OKLCH =
  /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)(%?)\s+([\d.]+)(?:deg)?\s*(?:\/\s*[\d.]+%?\s*)?\)$/i;

/**
 * Convert an `oklch()` colour to `#rrggbb`, clamped to the sRGB gamut.
 *
 * Mermaid derives shades from its theme variables with a colour library that
 * only understands hex/rgb/hsl, so the themes' oklch tokens must be converted
 * before they reach it.
 */
export function oklchToHex(color: string): string | null {
  const m = OKLCH.exec(color.trim());
  if (!m) return null;
  const l = Number(m[1]) / (m[2] ? 100 : 1);
  const c = Number(m[3]) * (m[4] ? 0.4 / 100 : 1);
  const h = (Number(m[5]) * Math.PI) / 180;
  if ([l, c, h].some(Number.isNaN)) return null;

  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return `#${linear
    .map((v) => {
      const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
      return Math.round(Math.min(Math.max(srgb, 0), 1) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

export interface MermaidThemeVariables {
  darkMode: boolean;
  [key: string]: string | boolean;
}

/**
 * Theme variables for mermaid's `base` theme, taken from the same tokens
 * `applyTheme` exposes as CSS custom properties, so diagrams match the app.
 */
export function mermaidThemeVariables(theme: Theme): MermaidThemeVariables {
  const colors: Record<string, string> = {
    background: theme.base100,
    mainBkg: theme.base100,
    primaryColor: theme.base100,
    primaryTextColor: theme.baseContent,
    primaryBorderColor: theme.primary,
    secondaryColor: theme.base300,
    tertiaryColor: theme.base200,
    nodeBorder: theme.primary,
    clusterBkg: theme.base300,
    clusterBorder: theme.primary,
    lineColor: theme.baseContent,
    textColor: theme.baseContent,
    titleColor: theme.baseContent,
    edgeLabelBackground: theme.base200,
    noteBkgColor: theme.base300,
    noteTextColor: theme.baseContent,
    noteBorderColor: theme.primary,
    actorBkg: theme.base100,
    actorBorder: theme.primary,
    actorTextColor: theme.baseContent,
    actorLineColor: theme.baseContent,
    signalColor: theme.baseContent,
    signalTextColor: theme.baseContent,
    labelBoxBkgColor: theme.base100,
    labelBoxBorderColor: theme.primary,
    labelTextColor: theme.baseContent,
    loopTextColor: theme.baseContent,
    activationBkgColor: theme.base300,
    activationBorderColor: theme.primary,
    errorBkgColor: theme.error,
    errorTextColor: theme.errorContent,
  };
  const vars: MermaidThemeVariables = { darkMode: theme.colorScheme === "dark" };
  for (const [key, value] of Object.entries(colors)) {
    const hex = oklchToHex(value);
    if (hex) vars[key] = hex;
  }
  return vars;
}
