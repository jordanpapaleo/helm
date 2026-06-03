# Find & Replace — Design Spec

**Date:** 2026-06-03  
**Status:** Approved

---

## Overview

Add in-note find & replace to the TipTap editor, triggered by Cmd+F. The UI is a compact overlay bar in the top-right corner of the editor, styled after VS Code's find widget.

---

## User Interaction

- **Cmd+F** (editor unfocused or focused, bar closed) → open bar in find-only mode, focus the find input
- **Cmd+F** (bar already open in find-only mode) → expand bar to show replace row
- **Cmd+F** (bar already open in replace mode) → no-op (already fully expanded)
- **Escape** → close bar, return focus to editor, clear highlights
- **Enter** in find input → advance to next match
- **Shift+Enter** in find input → go to previous match
- **↑ / ↓ buttons** → cycle through matches
- **Aa toggle** → match case (default: off)
- **ab toggle** → whole word (default: off)
- **Replace button** → replace current match, advance to next
- **Replace All button** → replace all matches in the note

---

## Architecture

### Two modes, one bar

The app has two note views — TipTap rich-text editor (`NoteEditor`) and a raw markdown textarea (`MarkdownTextarea` in `MainPanel.tsx`). Find/replace must work in both.

The `FindReplaceBar` is lifted to `MainPanel.tsx` so it sits above both views and shares a single open/expanded state. Each view receives a `findOpen` prop and handles search internally.

### New dependency

`@tiptap/extension-find-and-replace` — official TipTap extension that manages match decorations and exposes editor commands:
- `editor.commands.setSearchTerm(term)`
- `editor.commands.setReplaceTerm(term)`
- `editor.commands.setCaseSensitive(bool)`
- `editor.commands.setWholeWord(bool)`  
- `editor.commands.nextSearchResult()`
- `editor.commands.previousSearchResult()`
- `editor.commands.replace()`
- `editor.commands.replaceAll()`

### New component: `FindReplaceBar`

A focused, self-contained component. Props:

```ts
interface FindReplaceBarProps {
  mode: 'editor' | 'markdown';
  editor: Editor | null;          // TipTap editor instance (editor mode)
  textareaRef: RefObject<HTMLTextAreaElement> | null;  // (markdown mode)
  expanded: boolean;
  onExpand: () => void;
  onClose: () => void;
}
```

The component manages its own `findTerm`, `replaceTerm`, `caseSensitive`, `wholeWord` state. In editor mode it calls TipTap commands; in markdown mode it uses `textareaRef` with string search and `setSelectionRange`.

### Editor mode (TipTap)

1. Add `FindAndReplace` to the extensions array in `NoteEditor.tsx` (memoized).
2. The bar calls TipTap commands reactively as find term / options change.
3. Match highlights injected by the extension; styled via CSS targeting the extension's default class names.

### Markdown mode (textarea)

1. Find: scan `textarea.value` with `String.indexOf` / word-boundary regex, collect all match positions.
2. Highlight current match via `textarea.setSelectionRange(start, end)` + `textarea.focus()`.
3. Replace: splice replacement into the string at the current match position, call `onSave`.
4. Replace All: `String.replaceAll` (respecting case/word options), call `onSave`.
5. Match count tracked in local state.

### Changes to `MainPanel.tsx`

1. Add `findOpen: boolean`, `findExpanded: boolean` state.
2. Add a `keydown` listener on the window (`Mod+f`):
   - Closed → open, collapse
   - Open + collapsed → expand
   - Open + expanded → focus find input
3. Pass `findOpen` and a `textareaRef` down to `MarkdownTextarea`.
4. Pass `findOpen` down to `NoteEditor` (for the TipTap `Mod-f` shortcut to be suppressed when the bar is open).
5. Render `<FindReplaceBar>` absolutely positioned top-right within the note content area, only when `findOpen`.
6. `onClose`: clear state, return focus to the active editor.

---

## UI Layout

```
┌──────────────────────────────────────────────────────┐
│ [›] [ Find...              ] [Aa] [ab] 1 of 5  [↑][↓][✕] │  ← find row
│     [ Replace...           ] [Replace] [Replace All]      │  ← replace row (expanded only)
└──────────────────────────────────────────────────────┘
```

- `[›]` arrow rotates 90° when expanded (chevron-right → chevron-down)
- Match count shows `X of Y`; shows `No results` when term is non-empty and Y is 0
- Match count is hidden when find input is empty
- Current match highlight: `--color-accent` at 40% opacity
- Other match highlights: `--color-accent` at 15% opacity
- Bar background: `--color-surface`, border: `--color-border`, rounded-lg, shadow-xl — matches existing popup styling in `NoteEditor.tsx`

---

## Files Changed

| File | Change |
|------|--------|
| `package.json` | Add `@tiptap/extension-find-and-replace` |
| `src/components/editor/NoteEditor.tsx` | Add FindAndReplace extension; suppress native Mod-f when bar is open |
| `src/components/editor/FindReplaceBar.tsx` | New component (handles both editor and markdown mode) |
| `src/components/layout/MainPanel.tsx` | Lift open/expanded state; add window keydown listener; render FindReplaceBar; pass textareaRef to MarkdownTextarea |

---

## Out of Scope

- Search history (the `↑↓ for history` hint in VS Code's bar)
- Regex mode
- Persistent find term across note switches
