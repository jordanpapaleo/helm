/** Faces available for note text. `system` is the sans stack the editor already uses. */
export const NOTE_FONTS = [
  { id: "system", label: "System", family: "var(--font-sans)" },
  {
    id: "serif",
    label: "Serif",
    family: 'Iowan Old Style, Palatino, "Palatino Linotype", Georgia, serif',
  },
  { id: "mono", label: "Mono", family: "var(--font-mono)" },
] as const;

export type NoteFont = (typeof NOTE_FONTS)[number]["id"];

export function isNoteFont(value: unknown): value is NoteFont {
  return NOTE_FONTS.some((font) => font.id === value);
}

/** CSS font-family for a note-font id. Unknown ids fall back to the system face. */
export function noteFontFamily(font: NoteFont): string {
  return NOTE_FONTS.find((item) => item.id === font)?.family ?? NOTE_FONTS[0].family;
}

/**
 * Inline style for note body surfaces (editor, markdown source, print, pinned notes).
 * App chrome stays on `--font-sans`. Code blocks keep `--font-mono`.
 */
export const NOTE_CONTENT_STYLE = [
  "font-family: var(--editor-font-family)",
  "font-size: var(--editor-font-size)",
  "line-height: var(--editor-line-height)",
].join("; ");

export interface Settings {
  fontSize: number;
  lineHeight: number;
  /** Typeface for note text. Does not restyle the app chrome. */
  noteFont: NoteFont;
  autocompleteWikiLinks: boolean;
  autoSaveOnEdit: boolean;
  pinnedNotesFloat: boolean;
  showNoteCountOnTags: boolean;
  /** When false, archived notes are hidden from discovery views. */
  showArchivedNotes: boolean;
  /**
   * Projects are off until the user opts in. Turning this off hides project
   * navigation and scoped views; it does not delete project files.
   */
  enableProjects: boolean;
  defaultNoteView: "editor" | "markdown";
}

export const DEFAULT_SETTINGS: Settings = {
  fontSize: 16,
  lineHeight: 1.7,
  noteFont: "system",
  autocompleteWikiLinks: true,
  autoSaveOnEdit: true,
  pinnedNotesFloat: true,
  showNoteCountOnTags: true,
  showArchivedNotes: false,
  enableProjects: false,
  defaultNoteView: "editor",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Merge a persisted blob with defaults. An unknown `noteFont` is dropped so a
 * bad value cannot stick after a settings change.
 */
export function normalizeSettings(value: unknown): Settings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };
  const noteFont = isNoteFont(value.noteFont) ? value.noteFont : DEFAULT_SETTINGS.noteFont;
  return {
    ...DEFAULT_SETTINGS,
    ...(value as Partial<Settings>),
    noteFont,
  };
}

export function applySettings(s: Settings): void {
  const root = document.documentElement;
  root.style.setProperty("--editor-font-size", `${s.fontSize}px`);
  root.style.setProperty("--editor-line-height", String(s.lineHeight));
  root.style.setProperty("--editor-font-family", noteFontFamily(s.noteFont));
}
