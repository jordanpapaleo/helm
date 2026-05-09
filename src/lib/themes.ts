/**
 * Theme definition and application utilities.
 * Follows the DaisyUI color token convention — each theme defines a complete
 * set of semantic CSS custom properties applied via applyTheme().
 *
 * All color values use oklch() for perceptually uniform color interpolation.
 * macOS Tahoe / WebKit is fully supported.
 */

/**
 * Complete theme definition following DaisyUI's color token structure.
 */
export interface Theme {
  id: string;
  name: string;
  colorScheme: "light" | "dark";
  /** Color shown in theme picker dot */
  swatch: string;

  // ── Base surfaces ──────────────────────────────────────────────
  base100: string;
  base200: string;
  base300: string;
  baseContent: string;

  // ── Neutral ────────────────────────────────────────────────────
  neutral: string;
  neutralContent: string;

  // ── Primary ────────────────────────────────────────────────────
  primary: string;
  primaryContent: string;

  // ── Secondary ──────────────────────────────────────────────────
  secondary: string;
  secondaryContent: string;

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
    id: "light",
    name: "Light",
    colorScheme: "light",
    swatch: "oklch(93% .034 272.788)",
    base100: "oklch(100% 0 0)",
    base200: "oklch(98% 0 0)",
    base300: "oklch(95% 0 0)",
    baseContent: "oklch(21% .006 285.885)",
    neutral: "oklch(14% .005 285.823)",
    neutralContent: "oklch(92% .004 286.32)",
    primary: "oklch(45% .24 277.023)",
    primaryContent: "oklch(93% .034 272.788)",
    secondary: "oklch(65% .241 354.308)",
    secondaryContent: "oklch(94% .028 342.258)",
    accent: "oklch(77% .152 181.912)",
    accentContent: "oklch(38% .063 188.416)",
    info: "oklch(74% .16 232.661)",
    infoContent: "oklch(29% .066 243.157)",
    success: "oklch(76% .177 163.223)",
    successContent: "oklch(37% .077 168.94)",
    warning: "oklch(82% .189 84.429)",
    warningContent: "oklch(41% .112 45.904)",
    error: "oklch(71% .194 13.428)",
    errorContent: "oklch(27% .105 12.094)",
  },
  {
    id: "dark",
    name: "Dark",
    colorScheme: "dark",
    swatch: "oklch(58% .233 277.117)",
    base100: "oklch(25.33% .016 252.42)",
    base200: "oklch(23.26% .014 253.1)",
    base300: "oklch(21.15% .012 254.09)",
    baseContent: "oklch(97.807% .029 256.847)",
    neutral: "oklch(14% .005 285.823)",
    neutralContent: "oklch(92% .004 286.32)",
    primary: "oklch(58% .233 277.117)",
    primaryContent: "oklch(96% .018 272.314)",
    secondary: "oklch(65% .241 354.308)",
    secondaryContent: "oklch(94% .028 342.258)",
    accent: "oklch(77% .152 181.912)",
    accentContent: "oklch(38% .063 188.416)",
    info: "oklch(74% .16 232.661)",
    infoContent: "oklch(29% .066 243.157)",
    success: "oklch(76% .177 163.223)",
    successContent: "oklch(37% .077 168.94)",
    warning: "oklch(82% .189 84.429)",
    warningContent: "oklch(41% .112 45.904)",
    error: "oklch(71% .194 13.428)",
    errorContent: "oklch(27% .105 12.094)",
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    colorScheme: "light",
    swatch: "oklch(94.51% .179 104.32)",
    base100: "oklch(94.51% .179 104.32)",
    base200: "oklch(91.51% .179 104.32)",
    base300: "oklch(85.51% .179 104.32)",
    baseContent: "oklch(0% 0 0)",
    neutral: "oklch(23.04% .065 269.31)",
    neutralContent: "oklch(94.51% .179 104.32)",
    primary: "oklch(74.22% .209 6.35)",
    primaryContent: "oklch(14.844% .041 6.35)",
    secondary: "oklch(83.33% .184 204.72)",
    secondaryContent: "oklch(16.666% .036 204.72)",
    accent: "oklch(71.86% .217 310.43)",
    accentContent: "oklch(14.372% .043 310.43)",
    info: "oklch(72.06% .191 231.6)",
    infoContent: "oklch(0% 0 0)",
    success: "oklch(64.8% .15 160)",
    successContent: "oklch(0% 0 0)",
    warning: "oklch(84.71% .199 83.87)",
    warningContent: "oklch(0% 0 0)",
    error: "oklch(71.76% .221 22.18)",
    errorContent: "oklch(0% 0 0)",
  },
  {
    id: "synthwave",
    name: "Synthwave",
    colorScheme: "dark",
    swatch: "oklch(71% .202 349.761)",
    base100: "oklch(15% .09 281.288)",
    base200: "oklch(20% .09 281.288)",
    base300: "oklch(25% .09 281.288)",
    baseContent: "oklch(78% .115 274.713)",
    neutral: "oklch(45% .24 277.023)",
    neutralContent: "oklch(87% .065 274.039)",
    primary: "oklch(71% .202 349.761)",
    primaryContent: "oklch(28% .109 3.907)",
    secondary: "oklch(82% .111 230.318)",
    secondaryContent: "oklch(29% .066 243.157)",
    accent: "oklch(75% .183 55.934)",
    accentContent: "oklch(26% .079 36.259)",
    info: "oklch(74% .16 232.661)",
    infoContent: "oklch(29% .066 243.157)",
    success: "oklch(77% .152 181.912)",
    successContent: "oklch(27% .046 192.524)",
    warning: "oklch(90% .182 98.111)",
    warningContent: "oklch(42% .095 57.708)",
    error: "oklch(73.7% .121 32.639)",
    errorContent: "oklch(23.501% .096 290.329)",
  },
  {
    id: "lofi",
    name: "Lo-Fi",
    colorScheme: "light",
    swatch: "oklch(15.906% 0 0)",
    base100: "oklch(100% 0 0)",
    base200: "oklch(97% 0 0)",
    base300: "oklch(94% 0 0)",
    baseContent: "oklch(0% 0 0)",
    neutral: "oklch(0% 0 0)",
    neutralContent: "oklch(100% 0 0)",
    primary: "oklch(15.906% 0 0)",
    primaryContent: "oklch(100% 0 0)",
    secondary: "oklch(21.455% .001 17.278)",
    secondaryContent: "oklch(100% 0 0)",
    accent: "oklch(26.861% 0 0)",
    accentContent: "oklch(100% 0 0)",
    info: "oklch(79.54% .103 205.9)",
    infoContent: "oklch(15.908% .02 205.9)",
    success: "oklch(90.13% .153 164.14)",
    successContent: "oklch(18.026% .03 164.14)",
    warning: "oklch(88.37% .135 79.94)",
    warningContent: "oklch(17.674% .027 79.94)",
    error: "oklch(78.66% .15 28.47)",
    errorContent: "oklch(15.732% .03 28.47)",
  },
  {
    id: "cmyk",
    name: "CMYK",
    colorScheme: "light",
    swatch: "oklch(71.772% .133 239.443)",
    base100: "oklch(100% 0 0)",
    base200: "oklch(95% 0 0)",
    base300: "oklch(90% 0 0)",
    baseContent: "oklch(20% 0 0)",
    neutral: "oklch(21.778% 0 0)",
    neutralContent: "oklch(84.355% 0 0)",
    primary: "oklch(71.772% .133 239.443)",
    primaryContent: "oklch(14.354% .026 239.443)",
    secondary: "oklch(64.476% .202 359.339)",
    secondaryContent: "oklch(12.895% .04 359.339)",
    accent: "oklch(94.228% .189 105.306)",
    accentContent: "oklch(18.845% .037 105.306)",
    info: "oklch(68.475% .094 217.284)",
    infoContent: "oklch(13.695% .018 217.284)",
    success: "oklch(46.949% .162 321.406)",
    successContent: "oklch(89.389% .032 321.406)",
    warning: "oklch(71.236% .159 52.023)",
    warningContent: "oklch(14.247% .031 52.023)",
    error: "oklch(62.013% .208 28.717)",
    errorContent: "oklch(12.402% .041 28.717)",
  },
  {
    id: "garden",
    name: "Garden",
    colorScheme: "light",
    swatch: "oklch(62.45% .278 3.836)",
    base100: "oklch(92.951% .002 17.197)",
    base200: "oklch(86.445% .002 17.197)",
    base300: "oklch(79.938% .001 17.197)",
    baseContent: "oklch(16.961% .001 17.32)",
    neutral: "oklch(24.155% .049 89.07)",
    neutralContent: "oklch(92.951% .002 17.197)",
    primary: "oklch(62.45% .278 3.836)",
    primaryContent: "oklch(100% 0 0)",
    secondary: "oklch(48.495% .11 355.095)",
    secondaryContent: "oklch(89.699% .022 355.095)",
    accent: "oklch(56.273% .054 154.39)",
    accentContent: "oklch(100% 0 0)",
    info: "oklch(72.06% .191 231.6)",
    infoContent: "oklch(0% 0 0)",
    success: "oklch(64.8% .15 160)",
    successContent: "oklch(0% 0 0)",
    warning: "oklch(84.71% .199 83.87)",
    warningContent: "oklch(0% 0 0)",
    error: "oklch(71.76% .221 22.18)",
    errorContent: "oklch(12.122% .024 15.341)",
  },
  {
    id: "nord",
    name: "Nord",
    colorScheme: "light",
    swatch: "oklch(59.435% .077 254.027)",
    base100: "oklch(95.127% .007 260.731)",
    base200: "oklch(93.299% .01 261.788)",
    base300: "oklch(89.925% .016 262.749)",
    baseContent: "oklch(32.437% .022 264.182)",
    neutral: "oklch(45.229% .035 264.131)",
    neutralContent: "oklch(89.925% .016 262.749)",
    primary: "oklch(59.435% .077 254.027)",
    primaryContent: "oklch(11.887% .015 254.027)",
    secondary: "oklch(69.651% .059 248.687)",
    secondaryContent: "oklch(13.93% .011 248.687)",
    accent: "oklch(77.464% .062 217.469)",
    accentContent: "oklch(15.492% .012 217.469)",
    info: "oklch(69.207% .062 332.664)",
    infoContent: "oklch(13.841% .012 332.664)",
    success: "oklch(76.827% .074 131.063)",
    successContent: "oklch(15.365% .014 131.063)",
    warning: "oklch(85.486% .089 84.093)",
    warningContent: "oklch(17.097% .017 84.093)",
    error: "oklch(60.61% .12 15.341)",
    errorContent: "oklch(12.122% .024 15.341)",
  },
  {
    id: "dracula",
    name: "Dracula",
    colorScheme: "dark",
    swatch: "oklch(75.461% .183 346.812)",
    base100: "oklch(28.822% .022 277.508)",
    base200: "oklch(26.805% .02 277.508)",
    base300: "oklch(24.787% .019 277.508)",
    baseContent: "oklch(97.747% .007 106.545)",
    neutral: "oklch(39.445% .032 275.524)",
    neutralContent: "oklch(87.889% .006 275.524)",
    primary: "oklch(75.461% .183 346.812)",
    primaryContent: "oklch(15.092% .036 346.812)",
    secondary: "oklch(74.202% .148 301.883)",
    secondaryContent: "oklch(14.84% .029 301.883)",
    accent: "oklch(83.392% .124 66.558)",
    accentContent: "oklch(16.678% .024 66.558)",
    info: "oklch(88.263% .093 212.846)",
    infoContent: "oklch(17.652% .018 212.846)",
    success: "oklch(87.099% .219 148.024)",
    successContent: "oklch(17.419% .043 148.024)",
    warning: "oklch(95.533% .134 112.757)",
    warningContent: "oklch(19.106% .026 112.757)",
    error: "oklch(68.22% .206 24.43)",
    errorContent: "oklch(13.644% .041 24.43)",
  },
  {
    id: "abyss",
    name: "Abyss",
    colorScheme: "dark",
    swatch: "oklch(92% .2653 125)",
    base100: "oklch(20% .08 209)",
    base200: "oklch(15% .08 209)",
    base300: "oklch(10% .08 209)",
    baseContent: "oklch(90% .076 70.697)",
    neutral: "oklch(30% .08 209)",
    neutralContent: "oklch(90% .076 70.697)",
    primary: "oklch(92% .2653 125)",
    primaryContent: "oklch(50% .2653 125)",
    secondary: "oklch(83.27% .0764 298.3)",
    secondaryContent: "oklch(43.27% .0764 298.3)",
    accent: "oklch(43% 0 0)",
    accentContent: "oklch(98% 0 0)",
    info: "oklch(74% .16 232.661)",
    infoContent: "oklch(29% .066 243.157)",
    success: "oklch(79% .209 151.711)",
    successContent: "oklch(26% .065 152.934)",
    warning: "oklch(84.8% .1962 84.62)",
    warningContent: "oklch(44.8% .1962 84.62)",
    error: "oklch(65% .1985 24.22)",
    errorContent: "oklch(27% .1985 24.22)",
  },
  {
    id: "corporate",
    name: "Corporate",
    colorScheme: "light",
    swatch: "oklch(58% .158 241.966)",
    base100: "oklch(100% 0 0)",
    base200: "oklch(93% 0 0)",
    base300: "oklch(86% 0 0)",
    baseContent: "oklch(22.389% .031 278.072)",
    neutral: "oklch(0% 0 0)",
    neutralContent: "oklch(100% 0 0)",
    primary: "oklch(58% .158 241.966)",
    primaryContent: "oklch(100% 0 0)",
    secondary: "oklch(55% .046 257.417)",
    secondaryContent: "oklch(100% 0 0)",
    accent: "oklch(60% .118 184.704)",
    accentContent: "oklch(100% 0 0)",
    info: "oklch(60% .126 221.723)",
    infoContent: "oklch(100% 0 0)",
    success: "oklch(62% .194 149.214)",
    successContent: "oklch(100% 0 0)",
    warning: "oklch(85% .199 91.936)",
    warningContent: "oklch(0% 0 0)",
    error: "oklch(70% .191 22.216)",
    errorContent: "oklch(0% 0 0)",
  },
  {
    id: "retro",
    name: "Retro",
    colorScheme: "light",
    swatch: "oklch(80% .114 19.571)",
    base100: "oklch(91.637% .034 90.515)",
    base200: "oklch(88.272% .049 91.774)",
    base300: "oklch(84.133% .065 90.856)",
    baseContent: "oklch(41% .112 45.904)",
    neutral: "oklch(44% .011 73.639)",
    neutralContent: "oklch(86% .005 56.366)",
    primary: "oklch(80% .114 19.571)",
    primaryContent: "oklch(39% .141 25.723)",
    secondary: "oklch(92% .084 155.995)",
    secondaryContent: "oklch(44% .119 151.328)",
    accent: "oklch(68% .162 75.834)",
    accentContent: "oklch(41% .112 45.904)",
    info: "oklch(58% .158 241.966)",
    infoContent: "oklch(96% .059 95.617)",
    success: "oklch(51% .096 186.391)",
    successContent: "oklch(96% .059 95.617)",
    warning: "oklch(64% .222 41.116)",
    warningContent: "oklch(96% .059 95.617)",
    error: "oklch(70% .191 22.216)",
    errorContent: "oklch(40% .123 38.172)",
  },
  {
    id: "dim",
    name: "Dim",
    colorScheme: "dark",
    swatch: "oklch(86.133% .141 139.549)",
    base100: "oklch(30.857% .023 264.149)",
    base200: "oklch(28.036% .019 264.182)",
    base300: "oklch(26.346% .018 262.177)",
    baseContent: "oklch(82.901% .031 222.959)",
    neutral: "oklch(24.731% .02 264.094)",
    neutralContent: "oklch(82.901% .031 222.959)",
    primary: "oklch(86.133% .141 139.549)",
    primaryContent: "oklch(17.226% .028 139.549)",
    secondary: "oklch(73.375% .165 35.353)",
    secondaryContent: "oklch(14.675% .033 35.353)",
    accent: "oklch(74.229% .133 311.379)",
    accentContent: "oklch(14.845% .026 311.379)",
    info: "oklch(86.078% .142 206.182)",
    infoContent: "oklch(17.215% .028 206.182)",
    success: "oklch(86.171% .142 166.534)",
    successContent: "oklch(17.234% .028 166.534)",
    warning: "oklch(86.163% .142 94.818)",
    warningContent: "oklch(17.232% .028 94.818)",
    error: "oklch(82.418% .099 33.756)",
    errorContent: "oklch(16.483% .019 33.756)",
  },
  {
    id: "sunset",
    name: "Sunset",
    colorScheme: "dark",
    swatch: "oklch(74.703% .158 39.947)",
    base100: "oklch(22% .019 237.69)",
    base200: "oklch(20% .019 237.69)",
    base300: "oklch(18% .019 237.69)",
    baseContent: "oklch(77.383% .043 245.096)",
    neutral: "oklch(26% .019 237.69)",
    neutralContent: "oklch(70% .019 237.69)",
    primary: "oklch(74.703% .158 39.947)",
    primaryContent: "oklch(14.94% .031 39.947)",
    secondary: "oklch(72.537% .177 2.72)",
    secondaryContent: "oklch(14.507% .035 2.72)",
    accent: "oklch(71.294% .166 299.844)",
    accentContent: "oklch(14.258% .033 299.844)",
    info: "oklch(85.559% .085 206.015)",
    infoContent: "oklch(17.111% .017 206.015)",
    success: "oklch(85.56% .085 144.778)",
    successContent: "oklch(17.112% .017 144.778)",
    warning: "oklch(85.569% .084 74.427)",
    warningContent: "oklch(17.113% .016 74.427)",
    error: "oklch(85.511% .078 16.886)",
    errorContent: "oklch(17.102% .015 16.886)",
  },
  {
    id: "winter",
    name: "Winter",
    colorScheme: "light",
    swatch: "oklch(56.86% .255 257.57)",
    base100: "oklch(100% 0 0)",
    base200: "oklch(97.466% .011 259.822)",
    base300: "oklch(93.268% .016 262.751)",
    baseContent: "oklch(41.886% .053 255.824)",
    neutral: "oklch(19.616% .063 257.651)",
    neutralContent: "oklch(83.923% .012 257.651)",
    primary: "oklch(56.86% .255 257.57)",
    primaryContent: "oklch(91.372% .051 257.57)",
    secondary: "oklch(42.551% .161 282.339)",
    secondaryContent: "oklch(88.51% .032 282.339)",
    accent: "oklch(59.939% .191 335.171)",
    accentContent: "oklch(11.988% .038 335.171)",
    info: "oklch(88.127% .085 214.515)",
    infoContent: "oklch(17.625% .017 214.515)",
    success: "oklch(80.494% .077 197.823)",
    successContent: "oklch(16.098% .015 197.823)",
    warning: "oklch(89.172% .045 71.47)",
    warningContent: "oklch(17.834% .009 71.47)",
    error: "oklch(73.092% .11 20.076)",
    errorContent: "oklch(14.618% .022 20.076)",
  },
];

/**
 * Inject a <style> tag with [data-theme=X] CSS blocks for every theme.
 * Must be called once before applyTheme() so the CSS is ready.
 * Safe to call multiple times — reuses the same element.
 */
export function injectThemeStyles(): void {
  const css = THEMES.map(
    (t) => `
[data-theme="${t.id}"] {
  color-scheme: ${t.colorScheme};
  --color-base-100: ${t.base100};
  --color-base-200: ${t.base200};
  --color-base-300: ${t.base300};
  --color-base-content: ${t.baseContent};
  --color-neutral: ${t.neutral};
  --color-neutral-content: ${t.neutralContent};
  --color-primary: ${t.primary};
  --color-primary-content: ${t.primaryContent};
  --color-secondary: ${t.secondary};
  --color-secondary-content: ${t.secondaryContent};
  --color-accent: ${t.accent};
  --color-accent-content: ${t.accentContent};
  --color-info: ${t.info};
  --color-info-content: ${t.infoContent};
  --color-success: ${t.success};
  --color-success-content: ${t.successContent};
  --color-warning: ${t.warning};
  --color-warning-content: ${t.warningContent};
  --color-error: ${t.error};
  --color-error-content: ${t.errorContent};
}`,
  ).join("\n");

  let el = document.getElementById("helm-themes") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "helm-themes";
    document.head.appendChild(el);
  }
  el.textContent = css;
}

/**
 * Apply a theme by setting data-theme on :root.
 * Requires injectThemeStyles() to have been called first.
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme.id);
}
