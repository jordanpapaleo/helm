export interface Settings {
  fontSize: number;
  lineHeight: number;
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
  autocompleteWikiLinks: true,
  autoSaveOnEdit: true,
  pinnedNotesFloat: true,
  showNoteCountOnTags: true,
  showArchivedNotes: false,
  enableProjects: false,
  defaultNoteView: "editor",
};

export function applySettings(s: Settings): void {
  const root = document.documentElement;
  root.style.setProperty("--editor-font-size", `${s.fontSize}px`);
  root.style.setProperty("--editor-line-height", String(s.lineHeight));
}
