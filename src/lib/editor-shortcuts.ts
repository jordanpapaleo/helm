import type { Editor } from "@tiptap/core";

/**
 * Editor chords shared by the main note and a note pinned in the side panel.
 *
 * Help ▸ Editor Shortcuts in `src-tauri/src/lib.rs` lists this same set and
 * owns the accelerators (KEEP IN SYNC). The desktop window delivers those
 * chords through the menu, the same way heading shortcuts are delivered.
 * The keydown listener below covers a browser window, where there is no menu.
 * A chord that arrives both ways runs once.
 */

export const EDITOR_SHORTCUTS = [
  { id: "bold", menuId: "editor_bold", label: "Bold", accelerator: "CmdOrCtrl+B", kind: "format" },
  {
    id: "italic",
    menuId: "editor_italic",
    label: "Italic",
    accelerator: "CmdOrCtrl+I",
    kind: "format",
  },
  {
    id: "code",
    menuId: "editor_code",
    label: "Inline Code",
    accelerator: "CmdOrCtrl+E",
    kind: "format",
  },
  {
    id: "underline",
    menuId: "editor_underline",
    label: "Underline",
    accelerator: "CmdOrCtrl+U",
    kind: "format",
  },
  {
    id: "strike",
    menuId: "editor_strike",
    label: "Strikethrough",
    accelerator: "CmdOrCtrl+Shift+S",
    kind: "format",
  },
  {
    id: "highlight",
    menuId: "editor_highlight",
    label: "Highlight",
    accelerator: "CmdOrCtrl+Shift+H",
    kind: "format",
  },
  {
    id: "duplicate-block",
    menuId: "editor_duplicate_block",
    label: "Duplicate Block",
    accelerator: "CmdOrCtrl+Shift+D",
    kind: "block",
  },
  {
    id: "delete-block",
    menuId: "editor_delete_block",
    label: "Delete Block",
    accelerator: "CmdOrCtrl+Shift+K",
    kind: "block",
  },
  {
    id: "move-block-up",
    menuId: "editor_move_block_up",
    label: "Move Block Up",
    accelerator: "Alt+Up",
    kind: "block",
  },
  {
    id: "move-block-down",
    menuId: "editor_move_block_down",
    label: "Move Block Down",
    accelerator: "Alt+Down",
    kind: "block",
  },
] as const;

export type EditorShortcutId = (typeof EDITOR_SHORTCUTS)[number]["id"];

const MARKERS: Record<string, readonly [string, string]> = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  code: ["`", "`"],
  underline: ["<u>", "</u>"],
  strike: ["~~", "~~"],
  highlight: ["==", "=="],
};

const DEDUPE_MS = 50;

type MarkdownBinding = {
  element: HTMLTextAreaElement;
  apply: (id: EditorShortcutId) => void;
};

type Surface =
  | { kind: "rich"; editor: Editor }
  | { kind: "markdown"; apply: (id: EditorShortcutId) => void };

const richEditors = new Map<HTMLElement, Editor>();
let markdownBinding: MarkdownBinding | null = null;
let lastSurface: Surface | null = null;
const lastRun = new Map<EditorShortcutId, number>();

export function isEditorShortcutId(value: string): value is EditorShortcutId {
  return EDITOR_SHORTCUTS.some((shortcut) => shortcut.id === value);
}

export function isFormattingShortcut(id: EditorShortcutId): boolean {
  return EDITOR_SHORTCUTS.find((shortcut) => shortcut.id === id)?.kind === "format";
}

/** Which editor chord this keydown is, or null when it is some other key. */
export function matchEditorShortcut(event: KeyboardEvent): EditorShortcutId | null {
  if (event.isComposing) return null;
  if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
    if (event.key === "ArrowUp") return "move-block-up";
    if (event.key === "ArrowDown") return "move-block-down";
    return null;
  }
  const primary = (event.metaKey || event.ctrlKey) && !(event.metaKey && event.ctrlKey);
  if (!primary || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (event.shiftKey) {
    if (key === "s") return "strike";
    if (key === "h") return "highlight";
    if (key === "d") return "duplicate-block";
    if (key === "k") return "delete-block";
    return null;
  }
  if (key === "b") return "bold";
  if (key === "i") return "italic";
  if (key === "e") return "code";
  if (key === "u") return "underline";
  return null;
}

/** Wrap a markdown selection. Returns null for chords that are rich-editor only. */
export function wrapMarkdownSelection(
  value: string,
  start: number,
  end: number,
  id: EditorShortcutId,
): { value: string; start: number; end: number } | null {
  const pair = MARKERS[id];
  if (!pair) return null;
  const [prefix, suffix] = pair;
  return {
    value: value.slice(0, start) + prefix + value.slice(start, end) + suffix + value.slice(end),
    start: start + prefix.length,
    end: end + prefix.length,
  };
}

export function bindRichEditor(editor: Editor): () => void {
  const dom = editor.view.dom;
  richEditors.set(dom, editor);
  return () => {
    if (richEditors.get(dom) === editor) richEditors.delete(dom);
    if (lastSurface?.kind === "rich" && lastSurface.editor === editor) lastSurface = null;
  };
}

export function bindMarkdownShortcuts(
  element: HTMLTextAreaElement,
  apply: (id: EditorShortcutId) => void,
): () => void {
  markdownBinding = { element, apply };
  return () => {
    if (markdownBinding?.element === element) markdownBinding = null;
    if (lastSurface?.kind === "markdown") lastSurface = null;
  };
}

function elementOf(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function richFromTarget(target: EventTarget | null): Editor | null {
  const element = elementOf(target);
  const dom = element?.closest(".ProseMirror");
  if (!(dom instanceof HTMLElement)) return null;
  const editor = richEditors.get(dom);
  if (!editor || editor.isDestroyed) return null;
  return editor;
}

function surfaceFrom(target: EventTarget | null): Surface | null {
  const editor = richFromTarget(target);
  if (editor) return { kind: "rich", editor };
  if (markdownBinding && target === markdownBinding.element) {
    return { kind: "markdown", apply: markdownBinding.apply };
  }
  return null;
}

function rememberFocus(target: EventTarget | null) {
  const surface = surfaceFrom(target);
  if (surface) {
    lastSurface = surface;
    return;
  }
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    lastSurface = null;
  }
}

function resolveSurface(): Surface | null {
  const active = document.activeElement;
  const current = surfaceFrom(active);
  if (current) return current;
  // A title, search, or other field is focused. Do not format the note behind it.
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement
  ) {
    return null;
  }
  if (lastSurface?.kind === "rich") {
    if (lastSurface.editor.isDestroyed) return null;
    return lastSurface;
  }
  if (lastSurface?.kind === "markdown" && markdownBinding) {
    return { kind: "markdown", apply: markdownBinding.apply };
  }
  return null;
}

function runRich(editor: Editor, id: EditorShortcutId): void {
  if (!editor.isEditable || editor.isDestroyed) return;
  const chain = editor.chain().focus(undefined, { scrollIntoView: false });
  switch (id) {
    case "bold":
      chain.toggleBold().run();
      return;
    case "italic":
      chain.toggleItalic().run();
      return;
    case "code":
      chain.toggleCode().run();
      return;
    case "underline":
      chain.toggleUnderline().run();
      return;
    case "strike":
      chain.toggleStrike().run();
      return;
    case "highlight":
      chain.toggleHighlight().run();
      return;
    case "duplicate-block":
      chain.duplicateBlock().run();
      return;
    case "delete-block":
      chain.deleteBlock().run();
      return;
    case "move-block-up":
      chain.moveBlockUp().run();
      return;
    case "move-block-down":
      chain.moveBlockDown().run();
      return;
  }
}

function dispatch(id: EditorShortcutId, surface: Surface) {
  const now = performance.now();
  const previous = lastRun.get(id);
  if (previous !== undefined && now - previous < DEDUPE_MS) return;
  lastRun.set(id, now);
  if (surface.kind === "rich") runRich(surface.editor, id);
  else surface.apply(id);
}

/** Run a chord against the focused note surface, or the one that last had focus. */
export function applyEditorShortcut(id: EditorShortcutId): void {
  const surface = resolveSurface();
  if (!surface) return;
  dispatch(id, surface);
}

/**
 * Capture-phase keydown. Handles the chord when it lands in a note editor and
 * stops it there, so the rich editor and the markdown box do not both run it.
 */
export function handleEditorShortcutKeydown(event: KeyboardEvent): void {
  const id = matchEditorShortcut(event);
  if (!id) return;
  const surface = surfaceFrom(event.target);
  if (!surface) return;
  if (surface.kind === "markdown" && !isFormattingShortcut(id)) return;
  event.preventDefault();
  event.stopPropagation();
  dispatch(id, surface);
}

export function installEditorShortcutListener(): () => void {
  const onKey = (event: KeyboardEvent) => handleEditorShortcutKeydown(event);
  const onFocus = (event: FocusEvent) => rememberFocus(event.target);
  window.addEventListener("keydown", onKey, true);
  document.addEventListener("focusin", onFocus);
  return () => {
    window.removeEventListener("keydown", onKey, true);
    document.removeEventListener("focusin", onFocus);
  };
}
