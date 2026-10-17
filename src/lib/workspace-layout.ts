export const PANEL_BOUNDS = {
  navigation: { initial: 220, min: 180, max: 360 },
  notes: { initial: 260, min: 200, max: 480 },
  right: { initial: 320, min: 240, max: 600 },
};
export type Panel = keyof typeof PANEL_BOUNDS;
export interface LayoutPreferences {
  leftOpen: boolean;
  rightOpen: boolean;
  widths: Record<Panel, number>;
}
export const DEFAULT_LAYOUT: LayoutPreferences = {
  leftOpen: true,
  rightOpen: false,
  widths: { navigation: 220, notes: 260, right: 320 },
};
export function clampWidth(panel: Panel, value: number) {
  const bounds = PANEL_BOUNDS[panel];
  return Number.isFinite(value)
    ? Math.max(bounds.min, Math.min(bounds.max, value))
    : bounds.initial;
}
export function validateLayout(value: unknown): LayoutPreferences {
  const data = (value && typeof value === "object" ? value : {}) as Partial<LayoutPreferences>;
  return {
    leftOpen: typeof data.leftOpen === "boolean" ? data.leftOpen : true,
    rightOpen: typeof data.rightOpen === "boolean" ? data.rightOpen : false,
    widths: Object.fromEntries(
      Object.keys(PANEL_BOUNDS).map((key) => {
        const panel = key as Panel;
        const value = data.widths?.[panel];
        return [
          panel,
          typeof value === "number" ? clampWidth(panel, value) : PANEL_BOUNDS[panel].initial,
        ];
      }),
    ) as Record<Panel, number>,
  };
}
export const SEPARATOR_WIDTH = 4;
export function workspaceGeometry(
  width: number,
  notes: boolean,
  prefs: LayoutPreferences,
  priority: "left" | "right" = "left",
) {
  let left = prefs.leftOpen;
  let right = prefs.rightOpen;
  const minimum = () => 320 + (left ? 184 + (notes ? 204 : 0) : 0) + (right ? 244 : 0);
  for (const side of priority === "right" ? ["left", "right"] : ["right", "left"]) {
    if (minimum() <= width) break;
    if (side === "left") left = false;
    else right = false;
  }
  const panels: Panel[] = [
    ...(left ? ["navigation" as const, ...(notes ? ["notes" as const] : [])] : []),
    ...(right ? ["right" as const] : []),
  ];
  const widths = { ...prefs.widths };
  let excess = Math.max(
    0,
    320 + panels.reduce((sum, panel) => sum + widths[panel] + SEPARATOR_WIDTH, 0) - width,
  );
  for (const panel of panels) {
    const reduction = Math.min(excess, widths[panel] - PANEL_BOUNDS[panel].min);
    widths[panel] -= reduction;
    excess -= reduction;
  }
  const center = Math.max(
    0,
    width - panels.reduce((sum, panel) => sum + widths[panel] + SEPARATOR_WIDTH, 0),
  );
  return { left, right, widths, center };
}
