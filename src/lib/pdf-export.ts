import { THEMES, type Theme } from "./themes";

const RESERVED = new Set([...'\\/:*?"<>|']);

/** Default file name for a note's PDF: its title, made safe for any filesystem. */
export function pdfFileName(title: string): string {
  const cleaned = [...title]
    .map((ch) => {
      if (ch.charCodeAt(0) < 0x20) return " ";
      return RESERVED.has(ch) ? "-" : ch;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return `${/[^\s-]/.test(cleaned) ? cleaned : "Untitled"}.pdf`;
}

/**
 * The theme a note is printed in. Light themes print as they look; dark ones
 * fall back to the default light theme, because print engines leave the page
 * margins white and a dark page cannot fill the paper.
 */
export function printTheme(theme: Theme): Theme {
  if (theme.colorScheme === "light") return theme;
  return THEMES.find((t) => t.id === "light") ?? theme;
}
