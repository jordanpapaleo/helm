import { addCollection } from "@iconify/react";
import type { IconifyJSON } from "@iconify/types";
import source from "@iconify-json/uil/icons.json";

const uil = source as IconifyJSON;

/**
 * Unicons names Helm may render. The Iconify component otherwise loads icon
 * data from the network, which this offline app cannot do. Add a name here
 * when a component starts using it; the bundled-icons test fails if source
 * names a `uil:` icon that is missing from this list.
 */
export const BUNDLED_ICON_NAMES = [
  "angle-down",
  "angle-right",
  "angle-up",
  "apps",
  "archive",
  "arrow-left",
  "arrow-right",
  "arrow-up",
  "asterisk",
  "book-open",
  "brackets-curly",
  "briefcase",
  "bug",
  "chat",
  "check",
  "check-circle",
  "clipboard-notes",
  "clock",
  "cloud",
  "cloud-check",
  "cloud-slash",
  "cloud-upload",
  "cog",
  "columns",
  "comment-alt-lines",
  "comment-dots",
  "copy",
  "dashboard",
  "ellipsis-v",
  "exclamation-triangle",
  "external-link-alt",
  "eye-slash",
  "file-alt",
  "file-export",
  "file-medical",
  "folder",
  "folder-open",
  "folder-plus",
  "history",
  "info-circle",
  "lightbulb",
  "link",
  "lock",
  "map-pin",
  "pen",
  "plus",
  "setting",
  "star",
  "sync",
  "times",
  "trash-alt",
  "unlock",
  "wrench",
] as const;

function resolvedBody(name: string): string | undefined {
  const seen = new Set<string>();
  let current = name;
  while (!seen.has(current)) {
    seen.add(current);
    const icon = uil.icons[current];
    if (icon?.body) return icon.body;
    const parent = uil.aliases?.[current]?.parent;
    if (!parent) return undefined;
    current = parent;
  }
  return undefined;
}

/** The Unicons subset registered with Iconify. Each entry has inline SVG. */
export function bundledIconCollection(): IconifyJSON {
  const icons: IconifyJSON["icons"] = {};
  for (const name of BUNDLED_ICON_NAMES) {
    const body = resolvedBody(name);
    if (body) icons[name] = { body };
  }
  return { prefix: "uil", width: uil.width, height: uil.height, icons };
}

/** Install the subset so `uil:*` names render without the Iconify API. */
export function registerBundledIcons(): void {
  addCollection(bundledIconCollection());
}
