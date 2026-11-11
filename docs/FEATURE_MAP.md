# Helm — Feature Map

A checklist of what Helm does today, grouped by area. Each line is a feature; the bullets under it are the conditional rules that a rewrite can silently drop. Code locations are files and symbols, not line numbers, so they survive edits.

**How to use it.** Before changing an area, read its section. After the change, confirm every feature and rule in that section either still works or was removed on purpose, and record which in the PR's **Feature map check**. When behavior changes, edit this file in the same PR.

**Relationship to [FEATURES.md](FEATURES.md).** This map was built from the code and reconciled against `FEATURES.md`. `FEATURES.md` stays the long-form user guide; this file is the checklist. Where the two disagreed, the code won and `FEATURES.md` was corrected. If they disagree again, the code is the tiebreaker and both files get fixed.

**Known gaps** are marked **Gap:** — rules the product requires that `main` does not yet do, or settings that do nothing. They are listed so nobody mistakes them for working behavior.

Areas:

1. [Vault, files, and data model](#1-vault-files-and-data-model)
2. [Note header](#2-note-header)
3. [Properties](#3-properties)
4. [Editor](#4-editor)
5. [Sidebar and layout](#5-sidebar-and-layout)
6. [Note creation and templates](#6-note-creation-and-templates)
7. [Views: Kanban](#7-views-kanban)
8. [Views: Eisenhower](#8-views-eisenhower)
9. [Views: Graph](#9-views-graph)
10. [Views: Dashboard and briefing](#10-views-dashboard-and-briefing)
11. [Projects](#11-projects)
12. [Tags](#12-tags)
13. [Links](#13-links)
14. [History](#14-history)
15. [Trash and archive](#15-trash-and-archive)
16. [Sync](#16-sync)
17. [MCP server](#17-mcp-server)
18. [Settings and tools](#18-settings-and-tools)
19. [Quick capture](#19-quick-capture)

---

## 1. Vault, files, and data model

- **Notes are `.md` files with YAML frontmatter** — `src/lib/note-parser.ts` (`parseNote`, `serializeNote`)
  - Title falls back from frontmatter to the first H1 to the filename in Title Case.
  - Missing fields default to `state: Prepare` and `false` booleans; `template` is kept only when it is a real boolean.
  - Frontmatter tags and inline `#tags` are unioned on load. A non-array `tags` value contributes no frontmatter tags, and non-string entries in a list are dropped, so a bad `tags` value cannot stop the vault from loading.
  - `normalizeContent` strips leading and trailing newlines so gray-matter round-trips do not look like edits.
- **IDs are ULIDs, never filenames** — `src/types/note.ts`, `src/hooks/useVault.ts`
  - A file that arrives with no `id` gets a ULID written back on the next watcher event.
  - Adding a vault repairs missing `id`, `title`, `created`, and `updated`.
  - New files from the app are named by slug (`slugify`) or ULID; renames never change the id.
- **Timestamps** — `src/lib/timestamps.ts`, `mcp-server/timestamps.ts`
  - `created`/`updated` are UTC `YYYY-MM-DDTHH:MM:SSZ`; legacy date-only values still read and sort correctly.
  - `deadline` stays date-only.
- **All file I/O goes through Tauri** — `src/lib/tauri-commands.ts`, `src-tauri/src/vault.rs`
  - Paths must be absolute; any `..` component is rejected (`validate_path`).
  - `delete_asset` deletes only a non-markdown file whose canonical path is inside that vault's `assets/` directory. A sibling folder, a symlink that resolves outside it, and the directory itself are refused.
- **Atomic writes** — `vault.rs` (`atomic_write`, `write_note`, `write_asset`)
  - Writes go to `.{name}.tmp-{pid}` in the same folder, then rename; a failed rename deletes the temp file.
- **Rename ordering** — `src/store/notes.ts` (`renameNote`)
  - New content is written to the old path first, then the file is renamed, so a crash leaves an intact note.
  - A destination path already occupied by another loaded note, including a duplicate copy (`occupiedNotePaths`), is refused before the header paints the new title and before the write. A header save still queued behind an earlier edit therefore cannot persist the rejected title. The file is not renamed, the failure is reported, and a title already painted by a direct `renameNote` call is put back. This note's own path is not a collision.
  - That content is the latest store note. A caller that still holds a pre-flush snapshot does not get that snapshot written back over frontmatter the flush just saved.
- **Hidden directories are invisible** — `vault.rs` (`list_notes`, folder listing, watcher), `mcp-server/projects.ts` (`walkMarkdownFiles`)
  - Any directory starting with `.` (`.helm-history`, `.git`) is skipped by the scanner, the watcher, and the MCP walk; `assets/` is skipped as a note folder.
- **File watcher, one per vault** — `vault.rs` (`watch_vault`, `unwatch_vault`), `src/hooks/useVault.ts`
  - Watching an already-watched vault is a no-op; removing a vault keeps the watcher if another vault shares the folder.
  - Only non-hidden `.md` changes emit note events; a rename-from is treated as a delete.
  - A watcher event for a known path updates in place; same id at a new path updates in place; otherwise the note is added.
  - Removing a vault drops its notes and projects from the app and leaves the disk alone.
- **Store indexes stay in sync** — `src/store/notes.ts`
  - `setNotes`, `appendNotes`, `addNote`, `updateNote`, `removeNote`, and the bulk rewrites rebuild the search index and tag tree.
  - `addNote` ignores a note whose `filePath` is already loaded (watcher or StrictMode double-adds).
  - `removeNote` clears the selection if the removed note was selected.
- **Pending saves flush on close** — `src/lib/pending-saves.ts`, `src/lib/window-close.ts`, `src-tauri/src/lib.rs`
  - Every debounced saver registers a flusher; one failing flusher never blocks the others.
  - Closing the main window flushes for at most 2 s (`CLOSE_FLUSH_TIMEOUT_MS`), then exits; a second close skips the flush.
  - Rust has an 8 s watchdog and exits on a second close request; closing the capture window does not quit.
- **Duplicate ids** — `src/lib/duplicate-ids.ts` (KEEP IN SYNC with `mcp-server/duplicates.ts`), `src/store/notes.ts` (`derive`), `src/components/DuplicateIdsAlert.tsx`, `src/lib/resolve-duplicates.ts`
  - When two files share an id, one copy is kept: earliest `created`, then the shorter path, then path order (`compareCopies`). The others go to `duplicateGroups`, not `notes`.
  - The search index skips repeated ids, so only the kept copy is searchable.
  - A banner offers **Review duplicates**; each extra copy can get a new id (`giveNoteNewId`) or go to Trash (`trashDuplicateCopy`).
  - Trash restore treats every copy's path as occupied (`occupiedNotePaths`).
- **Per-note write queue** — `src/lib/note-write-path.ts` (`enqueueNoteWrite`)
  - Frontmatter writes, body saves, and renames for one note run in order on one chain, so a save never lands on a path a rename just left.
  - A debounced save writes to the path captured when it was scheduled, falling back to the note's last known path.
  - A failed frontmatter write reverts the store (`revertFrontmatterWrite` in `MainPanel`).
- **Bundled icons** — `src/lib/bundled-icons.ts` (`BUNDLED_ICON_NAMES`, `registerBundledIcons`)
  - The app is offline: only icons registered from the bundled `uil` set render. `registerBundledIcons` runs in `main.tsx` before the first render.
  - A new `uil:*` icon must be added to `BUNDLED_ICON_NAMES`; `src/lib/bundled-icons.test.tsx` fails if any source file uses an icon that is not bundled.
- **Window capabilities** — `src-tauri/capabilities/default.json`
  - Only `main` and `capture` are listed; a new window label must be added or its `invoke` calls fail silently.
- **Errors reach the user** — `src/store/toast.ts` (`reportError`), `src/components/ToastContainer.tsx`, `src/components/ErrorBoundary.tsx`
  - Error toasts stay 8 s, info toasts 4 s; a render crash shows a Reload screen instead of a blank window.

## 2. Note header

`src/components/editor/PropertyPanel.tsx`, wired by `src/components/layout/MainPanel.tsx`.

- **Title with inline edit** — `PropertyPanel` (`beginTitleEdit`, `commitTitle`)
  - The pencil appears only when the note is neither locked nor deleted.
  - Enter or the check button commits; Escape cancels; an empty or unchanged title is ignored.
  - Switching notes drops an in-progress edit.
  - A title-only change goes through `renameNote` (file rename plus wiki-link rewrite), not a plain write.
  - A title whose file name is already another note's path in the same folder is refused before the heading changes, so a queued header save cannot write that title.
  - Pending editor text is flushed first. The rename writes the store note from that flush, so frontmatter the flush just saved is kept.
- **Archived badge** — shown when `archived: true`.
- **Action row** — icon buttons: copy path (`uil:copy`), pin to side (`uil:columns`), history (`uil:history`), export PDF (`uil:file-export`), the Rich/Markdown toggle, archive (`uil:archive`), delete (`uil:trash-alt`), and the Properties toggle (`uil:info-circle`).
  - Every icon button has an `aria-label` and a tooltip.
  - Copy path shows a check for about 1.5 s.
  - Pin to side pins to the right panel; it does not set frontmatter `pinned` (`PinToSideButton.tsx`).
  - History and Export PDF are hidden for a deleted note; History also needs a vault path.
  - Archive and Delete are hidden for locked and deleted notes, and their handlers refuse too.
  - Delete is also refused while a sync barrier is active.
- **Rich/Markdown toggle** — a two-segment "Editor mode" group: Rich text (`uil:file-alt`) and Markdown (`uil:brackets-curly`), each with `aria-pressed`.
  - Markdown mode resets to the **Default note view** setting on note switch; toggling keeps caret and scroll position.
- **Workflow controls: State, Urgent, Important** — `StateSelect`, `FlagSwitch` (`uil:clock`, `uil:star`)
  - State is a select with an empty "State" option, then Prepare, Doing, Maintain, Done.
  - Urgent and Important are icon toggles with `aria-pressed`.
  - **Unmanaged note: the header hides only State, Urgent, and Important.** Everything else stays, including the Properties toggle.
  - Blocked has no header control; it is edited in [Properties](#3-properties).
- **Flag toggles: Pinned, Locked, Template, Unmanaged** — icon switches (`uil:map-pin`, `uil:lock`/`uil:unlock`, `uil:clipboard-notes`, `uil:eye-slash`), always shown, managed or not.
  - Turning Unmanaged on clears `state`, `urgent`, `important`, `blocked` in the same write (`UNMANAGED_CLEARED_FIELDS` in `src/lib/constants.ts`); turning it off only flips the flag.
- **Header tags** — `HeaderTags`
  - Each tag has a remove button (`uil:times`); **+ Tag** (`uil:plus`) opens an input.
  - Enter or blur commits, Escape cancels; a leading `#` is stripped; an empty or duplicate tag is ignored.
  - Removing a tag also removes its inline `#tag` from the body (`dropRemovedInlineTags` in `src/lib/tags.ts`), and that body change is snapshotted first (`MainPanel`).
- **Locked note** — `MainPanel` (`persistFrontmatterChange`)
  - Every frontmatter write except `locked` itself is dropped while the note is locked.
  - The header toggles stay clickable but their writes are dropped; the Properties editor is disabled. Only deleted notes disable the header (`readOnly`).
- **Deleted note view** — `MainPanel`
  - A banner offers Restore and permanent Delete; all header fields are disabled (`readOnly`).
  - Heading/paragraph menu commands are ignored.
- **Sync hold** — a frontmatter change is not written while the note or vault is write-blocked.

## 3. Properties

The panel opened by the header's Properties toggle in `PropertyPanel.tsx`.

- **Properties toggle** — `uil:info-circle` icon switch with `aria-pressed` and `aria-expanded`; shown for every note, managed or unmanaged; sits outside the disabled fieldset so a deleted note can still be inspected.
- **Read-only rows** — Path, `id`, `created`, `updated` (`READ_ONLY_KEYS`); timestamps shown in local time with the raw value as a tooltip.
- **Full value editor** — every other frontmatter key is an editable row (`editableKeys`, `FrontmatterValue`).
  - Known keys come first in a fixed order (`KNOWN_ORDER`: title, state, urgent, important, blocked, pinned, locked, template, unmanaged, archived, deadline, team, tags, links, `kanbanOrder`, `eisenhowerOrder`), then other keys in file order.
  - Editors by value: booleans toggle; `state` uses the state select; `deadline` and `YYYY-MM-DD` strings are dates and must be real calendar dates; timestamps are `YYYY-MM-DDTHH:mm:ssZ`; arrays are comma lists (numeric arrays stay numeric); numbers; objects as JSON or YAML; everything else as text.
  - An invalid value is rejected with a toast (`reportError`) and nothing is written.
  - Clearing a text, date, or timestamp field removes the key, unless it was already `""`.
  - **Unmanaged note:** `state`, `urgent`, and `important` rows are hidden (`UNMANAGED_HIDDEN_KEYS`); `blocked` stays.
- **Links** — read-only titles from `resolveOutgoingLinks`, same as the graph and footer; empty shows "—".
- **Disabled for locked and deleted notes** — the editable rows are a fieldset disabled when `readOnly` or `locked`; the read-only rows still show.

## 4. Editor

`src/components/editor/NoteEditor.tsx` (TipTap), the markdown textarea in `src/components/layout/MainPanel.tsx`, and `src/lib/save-note.ts`.

- **Autosave** — 1 s debounce plus save on blur.
  - Rich editor debounce runs only when **Auto-save on edit** is on; blur always saves unless locked.
  - Markdown textarea and the pinned-note pane debounce 1 s and save on blur.
  - Each surface registers with `pending-saves`.
- **Save path** — `saveNoteContent` in `save-note.ts`, shared by the main and pinned editors.
  - Unchanged text (after `normalizeContent`) is not written and does not bump `updated`; opening a note never saves (`emitUpdate: false`).
  - The previous file is snapshotted before every write.
  - Tags are merged, not recomputed (`mergeTagsOnSave`).
  - `[[wiki]]` titles become `links` ids (self excluded; empty removes the key).
  - Image assets removed from the body are deleted only when the file is inside that vault's `assets/` directory, and only after the write lands. An `asset.localhost` URL pointing anywhere else is left on disk. A failed write deletes nothing.
  - A failed write does not update the store, leaves the rich editor dirty, toasts via `reportError`, and is retried on the next save.
  - A frontmatter edit made while that write is in flight stays in the store, and the queued property write reads it back.
  - A body submitted while a write is already in flight is queued. That includes an undo back to the text still in the store.
  - A sync-blocked note keeps the draft in the editor, writes nothing, and toasts once.
- **Locked note is read-only** — `editor.setEditable(!locked)`; markdown textarea `readOnly`; block commands, formatting shortcuts, and Replace refuse.
- **Deleted note is read-only** — the editor gets `locked` while viewing Trash.
- **Editor keyboard shortcuts** — `src/lib/editor-shortcuts.ts`, Help ▸ Editor Shortcuts in `src-tauri/src/lib.rs`
  - The same chords apply in the main rich editor and in a note pinned in the side panel. The focused surface gets the chord. After the surface blurs without moving into another field, the chord still applies there, so the Help menu can run it.
  - A locked or deleted note keeps the chords wired and refuses them. A read-only pinned pane does the same until it is editable.
  - An input, textarea, or select keeps the keystroke, including the code-block language field, which sits inside the editor.
  - Formatting: ⌘B bold, ⌘I italic, ⌘E inline code, ⌘U underline, ⌘⇧S strikethrough, ⌘⇧H highlight. Ctrl replaces ⌘ on Windows and Linux. Markdown mode wraps the selection with `**`, `*`, backticks, `<u>`, `~~`, `==`.
  - Blocks, rich editors only: ⌘⇧D duplicate, ⌘⇧K delete, ⌥↑ / Alt+Up move up, ⌥↓ / Alt+Down move down. No-op in markdown mode and when the editor is not editable.
  - Help ▸ Editor Shortcuts lists this set, with those accelerators, for both the main note and the pinned side panel. A chord that also arrives in the page runs once.
- **Find and Replace** — `FindReplaceBar.tsx`, `findReplaceExtension.ts`
  - ⌘F opens Find; a second ⌘F expands Replace only when the note is neither locked nor deleted.
  - Case and whole-word toggles; Enter/Shift+Enter step; Escape closes.
- **Markdown mode** — raw textarea; no wiki popup, mermaid preview, or find decorations there.
  - Formatting shortcuts are the chords in [Editor keyboard shortcuts](#4-editor). Block commands are not available here.
- **Wiki-link autocomplete** — `WikiLink.ts`, `WikiLinkMenu.tsx`, `wikiLinkCandidates` in `src/lib/archive.ts`
  - Typing `[[` lists up to 8 title matches, excluding the current note; archived notes only when **Show archived notes** is on, labeled "(archived)".
  - Off when **Autocomplete wiki links** is off.
  - The main editor and a note pinned in the side panel both open this dropdown. Markdown mode does not.
  - A finished `[[Title]]` does not open the dropdown. Placing the caret inside one, including by clicking it, leaves the menu closed. Typing `[[` still opens it while those brackets are unclosed, even when another finished link is already on the same line.
- **Image paste** — saves to `<vault>/assets/` with a timestamp name and inserts the image; main editor only.
- **Code blocks** — `CodeBlockView.tsx`, `extensions.ts`, `editor-keyboard.ts`
  - Language picker; paste inside a block is verbatim; Enter on a bare ```` ```lang ```` fence makes a block; arrow keys can escape a trapped block.
- **Mermaid** — `MermaidSource.ts`, `MermaidPreview.tsx`
  - Shows only the diagram until **Edit source** or a click; hides on Hide source, Escape, blur, or caret leaving; the caret never rests in hidden source.
  - Empty source always shows source; invalid diagrams show the parse error; themed and offline.
- **Block commands** — `BlockCommands.ts`: ⌘⇧D duplicate, ⌘⇧K delete, ⌥↑/⌥↓ move; no-op when not editable.
- **Keyboard fixes** — Backspace at a heading start makes a paragraph; Enter clears marks except in lists, tasks, and code.
- **Export to PDF** — `usePdfExport.ts`, `NotePrintView.tsx`, `src/lib/pdf-export.ts`, `src-tauri/src/pdf.rs`
  - From the header, File menu (⇧⌘E), or note-list menu; flushes pending saves first; one export at a time.
  - Renders title, body, and mermaid diagrams (waits for them and fonts); dark themes print on Light.
- **History modal** — see [History](#14-history).
- **Backlinks footer** — `BacklinksPanel.tsx`
  - Hidden when there are no links either way; incoming links hide archived sources unless the setting is on; outgoing links keep archived targets.
- **Sync-aware reload** — `NoteEditor.tsx`, `decideEditorSync` in `src/lib/git-sync.ts`
  - Clean editor plus a different file adopts the file; dirty editor plus a different file holds the draft; switching notes keeps a held draft.
  - A local save landing while a newer edit is outstanding does not hold the note in the rich editor, the markdown textarea, or the pinned pane, and the newer edit can still be written.
  - A local save landing in a clean editor is shown there when that editor has not submitted a newer body. That includes a body saved from the pinned pane, so the next keystroke in the open note keeps the side-panel text. An earlier markdown save does not replace a newer body that is already queued.
- **Pinned-note pane** — `src/components/layout/PinnedNoteView.tsx`
  - Edits a pinned note with the same save path but no header or image paste; follows the main editor's live draft when both show the same note.
  - Typing `[[` opens the note-link dropdown. It uses the same candidates, the 8-title limit, the archived label, and the **Autocomplete wiki links** switch as the main editor.
  - Clicking a `[[Title]]` that `wikiLinkTargetId` resolves sets the main note to that note through `openNote`, including an archived target. A title that matches nothing leaves the main note unchanged. A locked pane still opens the link. Dragging to select the text does not. The click does not open the note-link dropdown.
  - A side-panel edit of the note that is also open stays. The open editor shows that saved body when it has no newer keystrokes, and a later keystroke there does not drop the side-panel text.
  - Uses the same editor keyboard shortcuts as the main rich editor when the pane is editable, and keeps them wired when it is not.
  - A held draft is dropped only after that save writes. A failed write keeps the draft and retries next time.

## 5. Sidebar and layout

`src/components/layout/LeftColumn.tsx`, `NoteListPanel.tsx`, `AppShell.tsx`, `AppToolbar.tsx`, `CollapsedSidebar.tsx`, `RightPanel.tsx`, `src/components/QuickOpen.tsx`, `src/lib/note-list.ts`, `src/lib/quick-open.ts`, `src/lib/workspace-layout.ts`, `src/store/ui.ts`, `src/store/layout.ts`.

- **Views nav** — Dashboard, Eisenhower, Kanban, Link (graph); also on the collapsed icon rail.
- **Vaults** — add, remove (confirm; disk untouched), select.
  - Clicking the active vault deselects it and returns to All Notes.
  - Counts respect **Show archived notes**.
  - Folders, Tags, Archive, and Trash render only while a vault is selected.
  - **Sync all** shows only with more than one sync-enabled vault and none selected.
- **Folders** — tree including empty folders; create, rename, delete, New Note Here, New Subfolder.
  - Folder names are used raw (no slug).
  - The name field stays open if it blurs before a name is entered, so the click that opens it does not cancel the create. Escape cancels. Enter, or leaving the field with a name, creates the folder. Clicking New folder again closes an empty field and creates a folder when a name is already typed.
  - A trailing slash on the vault path still creates the folder and keeps it in the tree. A failed listing keeps that vault's folders and still applies the other vaults. A listing that started before the create finished does not remove the new folder.
  - Rename moves the selection with it; delete confirms and clears selection and contained projects.
  - **Convert to Project** appears only with projects enabled, not at the vault root, and not overlapping a project.
  - Project folders are left out of this tree when projects are enabled.
- **Tags section** — hierarchical, recursive counts; hidden when empty; built from visible notes; Rename/Delete Tag in the context menu (see [Tags](#12-tags)).
- **All Notes, Archive, Trash** — see [Trash and archive](#15-trash-and-archive).
- **Note list** — `notesForList`
  - Pinned notes always come first, then most recently updated (`byRecent`). There is no setting to turn this off. This is the only list that floats pinned notes: the Dashboard sorts by date and the boards by saved order.
  - Folder scope is a path prefix; tag scope matches the tag or a descendant.
  - Archived notes hidden unless the setting is on; a search also returns scoped archived and Trash matches, marked.
  - Search matches title, tags, or body; each grouping keeps its own query.
  - Rows show up to 3 tags, a pin icon, an Archived badge, and the date.
  - Clicking a row opens it through `openNote` in `src/store/ui.ts`: Notes view, current grouping kept, one Back/Forward entry.
- **Go to Note (⌘P / Ctrl+P)** — `QuickOpen.tsx`, `quickOpenResults` and `quickOpenFolder` in `src/lib/quick-open.ts`
  - File ▸ Go to Note… carries the `CmdOrCtrl+P` accelerator and emits `quick-open` to the main window only; a capture-phase `keydown` listener also catches it, so it works while the editor has focus and the webview never prints. Opening is idempotent.
  - Uses the store's `searchIndex`, prefix plus `fuzzy: 0.2`, max 50. A query shows **Matching titles**, then **Matching content** for body matches that are not already title matches. Each note is in one section. An empty query lists the 20 most recently updated notes with no sections.
  - Archived notes only when **Show archived notes** is on; Trash never; unmanaged notes and templates included.
  - Rows show the title, then a muted folder path beside it (vault-relative, folder only, not the filename; vault name at the root, vault-prefixed with several vaults), state for managed notes, first tag, Archived badge. Same titles stay distinct by that path.
  - ↑/↓ wrap, Enter or click opens, Escape or backdrop closes and restores focus; Tab stays in the dialog.
  - Opens through the same `openNote` as the note list; from Trash it switches to All Notes so the live note shows.
  - Main window only; the capture window has no palette.
- **Note list context menu** — `NoteListPanel.tsx`
  - Always: Pin/Unpin, Rename, Lock/Unlock, Mark Managed/Unmanaged, Copy path, Export PDF, Add to/Unpin from Right panel, Move to….
  - Mark Unmanaged clears `state`, `urgent`, `important`, `blocked`; Mark Managed only flips the flag.
  - Move to category only with projects on, for a project member that is not the main page.
  - Archive and Delete are omitted for locked notes, and their handlers refuse.
- **Drag a note onto a folder or tag** — `src/lib/note-drop.ts`, `note-drag.ts`, `NoteDropSurface.tsx`
  - Folder drop renames the file into the folder after flushing pending saves; same folder is a no-op.
  - Tag drop appends the frontmatter tag only; refused for locked or sync-blocked notes; invalid or duplicate tag is a no-op.
  - Vault rows accept drops only when that vault is active.
- **Back/Forward** — view + note + grouping history, max 100, duplicates skipped; ⌘←/⌘→ outside text inputs.
- **Panels** — `workspace-layout.ts`, `store/layout.ts`, `PanelSeparator.tsx`
  - Closed left panel collapses to a 40 px icon rail; the note list shows only in Notes.
  - Widths clamp (nav 180–360, list 200–480, right 240–600) and persist in `helm-layout`; separators resize with arrow keys in 10 px steps.
  - At narrow widths the center keeps 320 px: right panel hides first, then the left; an explicitly opened side wins.
- **Right panel** — `RightPanel.tsx`, `src/store/pinned-panel.ts`
  - Pinned notes are tabs on the left (max 12, oldest dropped, persisted); enabled tools on the right; wrench opens Settings → Tools.
  - Left/Right arrows move between tabs; empty shows **No tools enabled**.

## 6. Note creation and templates

`src/lib/create-note.ts`, `src/lib/templates.ts`, `src/components/sidebar/NewNoteMenu.tsx`.

- **Single creation path** — every New Note entry point calls `createNote`.
  - Destination: selected folder, else vault root; a selected tag adds the tag and an inline `#tag`.
  - Project folder defaults apply first (see [Projects](#11-projects)), then the entry point's overrides.
  - A blank note is titled `Untitled`, `state: Prepare`, and omits `template`.
- **New Note menu** — Blank, then every `template: true` note by title.
  - Locked templates are listed; Trash notes are not.
  - Duplicate titles (and a template titled "Blank") get a vault/path suffix, lengthened until unique.
- **Template instantiation** — `instantiateNote`
  - Copies title, body, and tags only.
  - Does not copy state, urgent, important, blocked, pinned, locked, links, deadline, team, unmanaged, custom keys, or board order.
  - Fresh ULID, `created`, `updated`; writes `template: false`; never modifies the template file.
  - Creation context (Kanban column, Eisenhower cell, tag) overrides the blank defaults.

## 7. Views: Kanban

`src/views/KanbanView.tsx`, scoped by `src/hooks/useScopedWorkflowNotes.ts`.

- **Four columns** — Prepare, Doing, Maintain, Done (`NOTE_STATES`).
  - **Unmanaged notes never appear**, even with a matching state.
  - Archived notes hidden unless the setting is on.
  - With projects on and a project folder selected, only that project's notes show and the title names the project.
- **Drag and drop** — writes `state`, `kanbanOrder`, and `updated`; cancel restores the previous order; order persists via `kanbanOrder`.
- **Column +** — Blank/template menu; new note gets that column's state, in the project root when scoped.
- **Cards** — click opens the note; badges for blocked, archived, and up to 2 tags.

## 8. Views: Eisenhower

`src/views/EisenhowerView.tsx`, `getQuadrant` in `src/types/note.ts`, `EISENHOWER_QUADRANTS` in `src/lib/constants.ts`.

- **2×2 grid** — Do, Schedule, Delegate, Eliminate from `urgent` × `important`.
  - **Only managed notes in Prepare or Doing appear**; unmanaged, Maintain, and Done are excluded.
  - Archived and project scope as in Kanban.
- **Drag and drop** — sets `urgent`/`important` and `eisenhowerOrder`; `updated` changes only when the quadrant changes.
- **Quadrant +** — new note gets that quadrant's flags, in the project root when scoped.
- **Cards** — blocked, archived, up to 3 tags; empty quadrant shows "Drop here".

## 9. Views: Graph

`src/views/GraphView.tsx`, `src/views/graph-link-style.ts`, `src/lib/note-links.ts`.

- **Force graph of all visible notes** — vault-wide, never project-scoped; archived hidden unless the setting is on.
- **Edges** — from `resolveOutgoingLinks` (frontmatter ids plus body wiki links; see [Links](#13-links)).
- **Nodes** — size from link degree; color from state (unmanaged/empty state uses the accent); archived shown with a dashed ring and "(archived)".
- **Interactions** — click opens the note; hover dims non-neighbors; labels appear above 0.7 zoom.
  - Dragging a node onto another appends the target id to the source's `links`.
  - Clicking an edge removes it only if it came from frontmatter `links`; wiki-only edges cannot be deleted here.
- **Link style** — 1 px at 50% opacity at rest; thicker for neighbors and delete hover.

## 10. Views: Dashboard and briefing

`src/views/DashboardView.tsx`, `src/lib/briefing.ts` (KEEP IN SYNC with `mcp-server/briefing.ts`).

- **Daily Briefing card** — Doing, Blocked, Overdue, Due soon, Stale Doing; "All clear" when empty.
  - **Unmanaged notes are excluded** before any bucket; Done notes are excluded from every bucket.
  - Overdue: deadline before today. Due soon: today through 7 days. Stale: Doing and `updated` 14+ days ago (no `updated` is not stale).
- **Summary chips** — Do, Schedule, Delegate, Eliminate, Blocked, Total; clicking filters, clicking again clears.
  - Chips and the note list count unmanaged notes (only the briefing filters them out).
- **Charts** — top 8 tags, states, and team (only when any note has a team), on the filtered subset.
- **Note list** — newest first with state, urgent, blocked, and archived badges; an unmanaged note shows no state badge.
- **Scope** — same project/archive scope as the boards.

## 11. Projects

`src/lib/projects.ts` (KEEP IN SYNC with `mcp-server/projects.ts`), `src/lib/project-actions.ts`, `src/lib/project-scope.ts`, `src/store/projects.ts`, `src/components/projects/*`.

- **Opt-in** — off until **Enable Projects**; turning it off hides navigation and scoped boards without touching files.
- **Identity** — a folder with `helm-project.json` (`id`, `name`, `mainPageId`, `status`, `repository`, `links`); the folder name is only a label.
  - Invalid metadata is ignored; unknown status reads as `active`.
  - Missing `links` reads as `[]`. A saved link needs a label and an http(s) URL. A value with no scheme, including `host:port`, is stored as https, and a git remote is stored as its https page. An unsupported scheme is dropped. `repository` is left as it was.
- **Four categories** — Thinking, Features, Bugs, Context / Docs, created for every project.
  - New notes in Thinking and Context start unmanaged with empty state; Features and Bugs use the normal default and are never set to Doing.
- **Main page** — an ordinary unmanaged note at the project root with purpose, plan, next action, where you left off, and blockers.
  - It cannot be moved into a category.
  - Overview fields are read-only when the main page is locked.
  - Shows Doing and Blocked counts (Blocked excludes Done) and links to scoped Dashboard, Kanban, Eisenhower.
- **Membership is by folder** — a note is a member only when its file is inside the project folder; links do not grant membership.
- **No nested projects** — create and convert refuse overlap with an existing project.
- **Create / Convert** — create makes a slug folder, the four folders, metadata, and the main page; convert adds missing folders and a main page without moving existing notes; refuses the vault root and existing metadata.
- **Move to category / Move to…** — renames the file only; id, body, links, history, and workflow fields stay; name collisions get a `-2` suffix.
- **Sidebar** — Projects section with categories and custom child folders; section + opens Blank/template; rename, new subfolder, delete via context menu; renaming the root folder updates the stored name.
- **Repository** — optional; http/https open as written; ssh/git/scp remotes open as https; anything else stays text with Edit. Custom links do not replace this field.
- **Custom links** — on the project page, **Add link** shows Label and URL. Several links can be saved on the project (`links` in `helm-project.json`) and are still there after reload. Each saved link opens its URL. **Remove** drops that link and leaves the repository alone. A blank label, or a URL that is not http(s), a git remote, or a schemeless address (including host and port), is not saved.
- **Leave project** — returns to the vault-wide Dashboard and clears the scope.

## 12. Tags

`src/lib/tags.ts`, `src/lib/note-parser.ts` (`extractInlineTags`, KEEP IN SYNC with `mcp-server/index.ts`), `src/store/notes.ts`.

- **Inline tag syntax** — `#` then a letter, then letters, digits, `/`, `_`, `-`; not after an alphanumeric (so headings are not tags).
  - Code fences and inline code are ignored; 3- and 6-digit hex colors are not tags.
- **Frontmatter list on load** — `parseNote` keeps string entries of a `tags` array and unions them with inline tags. A number, string, or other non-array is treated as no frontmatter tags; non-string list entries are skipped. The file is still loaded.
- **Hierarchy** — `a/b` implies `a`; filtering by a tag includes descendants but not prefix collisions (`work` does not match `workflow`).
- **Tag tree** — null-prototype maps so tags like `constructor` or `__proto__` cannot break loading.
- **Rename tag** — rewrites frontmatter and inline `#tags` (outside code) in every note, descendants included; rejects invalid names with a toast.
- **Delete tag** — removes the tag and descendants from frontmatter and body.
  - Each rewritten note is snapshotted first; one failed write does not stop the batch and one toast summarizes failures.
  - Tag rename and delete do not skip locked notes (unlike title renames).
- **Merge on save** — a tag is dropped only if it was inline before the edit and is gone after; frontmatter-only tags survive body edits.

## 13. Links

`src/lib/note-links.ts` (KEEP IN SYNC with `mcp-server/links.ts`), `src/components/editor/WikiLink.ts`.

- **Wiki links** — `[[Title]]`, case-insensitive, spaces trimmed; escaped `\[\[...\]\]` from older saves still counts.
- **Links are ids** — saving writes resolved ULIDs to `links`; renames never break them.
- **Resolution** — graph, footer, and Properties all use `resolveOutgoingLinks`: existing frontmatter ids first, then body titles; self and unknown titles ignored; when two notes share a title, the later one wins.
- **Rename rewrite** — `notesToRewrite`, `replaceWikiLinkTitle`
  - `[[Old Title]]` is rewritten only where it resolved to the renamed note.
  - Locked notes are skipped (no snapshot, no write); link ids are kept either way.
  - Rewritten notes are snapshotted before the write.
- **Archived targets** — links to archived notes stay valid and openable.

## 14. History

`src-tauri/src/vault.rs` (`snapshot_note`, `list_note_history`), `mcp-server/history.ts` (KEEP IN SYNC), `src/components/editor/NoteHistoryModal.tsx`.

- **Snapshots** — `<vault>/.helm-history/<note-id>/<epoch-ms>.md`, taken before a content write.
  - Coalesced: no new snapshot if the newest is under 5 minutes old (`HISTORY_MIN_AGE_SECS = 300`, `HISTORY_MIN_AGE_MS = 300_000`). Ordinary edits keep this window. `snapshot_note`'s `min_age_secs` is optional and defaults to 300 when omitted.
  - Retention: the newest 50 are kept (`HISTORY_MAX_KEEP = 50`).
  - A snapshot in the same millisecond as the newest one gets a later filename. Prune must not make that newer body look older.
  - Note id must be non-empty ASCII alphanumeric; a missing source file is a silent no-op.
  - Snapshot failure never blocks the save.
  - MCP delete and restore force a snapshot regardless of age.
  - Editor restore forces a snapshot (`min_age_secs` 0) of the current file before the save path replaces it. If that snapshot fails, the note is left unchanged.
- **History modal** — lists versions newest first; previews the body; Restore forces a snapshot of the current file (min age 0), then writes the chosen body through the normal save path.
- **History is local** — `.helm-history/` is hidden from the scanner and git-ignored by sync.

## 15. Trash and archive

`src/store/trash.ts`, `src/lib/restore-trash.ts`, `src/lib/archive.ts` (KEEP IN SYNC with `mcp-server/archive.ts`), `src/lib/note-list.ts`.

- **Delete moves to Trash** — confirm, copy to the Trash store (`localStorage` key `helm-trash`), deselect, remove, delete the file.
  - Refused for locked notes, for a note already in Trash, and (header) while a sync barrier is active.
- **Trash list** — newest first; click to read; deleted notes are read-only with Find but no Replace.
  - Per row: Restore and permanent Delete.
  - **Restore all** restores at most one snapshot per path; the rest stay in Trash with a toast naming the paths.
  - **Delete all** confirms first and clears the selection if it was trashed.
- **Archive** — sets `archived: true` in place; file, id, content, tags, links, history, and workflow fields are untouched; Unarchive sets `false`.
  - Only `archived === true` counts as archived.
  - Refused for locked notes (header and note-list menu).
  - **Show archived notes** (default off) hides archived notes from lists, counts, tags, boards, graph, dashboard, briefing, wiki autocomplete, and Go to Note.
  - The Archive grouping always lists archived notes; list search always finds them, marked Archived.
  - Opening an archived note by id still works.

## 16. Sync

`src/lib/git-sync.ts`, `src/lib/git-sync-runtime.ts`, `src/store/git-sync.ts`, `src-tauri/src/git_sync.rs`, `src/components/settings/SyncTab.tsx`, `src/components/layout/VaultSyncButton.tsx`.

- **Off by default** — per-vault; a vault with no sync settings behaves as before (`enabled: false`; pull on startup and auto-push default on once enabled).
- **Connect** — previews the files to upload first; the vault must be the git root.
- **Pull on startup / push after checkpoints** — checkpoints debounce 5 s after vault changes; auto-push only when there is something to push.
- **Manual Sync, Pull, Push** — in Settings and on each connected vault; the vault button is hidden when sync is off; blocked while a barrier is active or a flush failed.
- **Safety** — never force-push, `reset`, or `clean`; conflicts abort the merge, keep local notes, and mark the vault for attention.
  - A managed `.gitignore` block excludes `.helm-history/`, `.helm-sync-backups/`, temp files, and `.DS_Store`; history is never uploaded.
- **Write blocks** — a held or barrier-blocked note keeps the editor draft and does not write (see [Editor](#4-editor)).

## 17. MCP server

`mcp-server/index.ts` plus `links.ts`, `archive.ts`, `briefing.ts`, `projects.ts`, `history.ts`, `timestamps.ts`, `duplicates.ts`, `workflow.ts`.

- **Vault selection** — `HELM_VAULTS` (comma list) wins over `HELM_VAULT`; default `$HOME/notes`.
- **22 tools** — reads (`get_rules`, `list_notes`, `read_note`, `resolve_note`, `search_notes`, `get_eisenhower`, `get_kanban`, `get_backlinks`, `get_tag_tree`), writes (`create_note`, `update_note`, `delete_note`), history (`get_note_history`, `read_note_version`, `restore_note_version`), `get_briefing`, projects (`list_projects`, `get_project`, `create_project`, `promote_folder`, `capture_to_thinking`, `move_note_to_category`). Also `note://` resources and four prompts.
- **Reads** — walk the vault recursively, skipping dot-directories, `assets/`, and symlinks.
- **Archived** — excluded unless the caller passes `include_archived: true`; the app setting is ignored; `read_note` by id still works.
- **Duplicate ids** — `partitionDuplicateIds` keeps the same copy the app keeps; every tool reads and writes that copy, and the others are not listed.
- **Unmanaged** — `get_eisenhower`, `get_kanban`, and `get_briefing` exclude unmanaged notes.
  - `get_kanban` buckets with `state ?? "Prepare"`, never `||`, so an empty state stays off the board (`groupKanban` in `workflow.ts`).
  - `get_eisenhower` includes only Prepare and Doing notes (`groupEisenhower`).
- **Locked** — `update_note`, `delete_note`, `restore_note_version`, and `move_note_to_category` refuse locked notes.
- **Protected fields** — `id` and `locked` are ignored on update and kept on restore.
- **Snapshots** — update snapshots before writing; delete and restore force a snapshot.
- **delete_note** — removes the file; it cannot use the app's Trash.
- **Title change** — follows the same wiki-link rewrite rule as the app (resolved links only, locked skipped).
- **Projects** — capture to Thinking is unmanaged; category moves rename only and refuse the main page. `list_projects` and `get_project` include `links` along with `repository`.
- **Parity** — inline tags, tag merge, link resolution, archive check, briefing, history, and project rules mirror the app (KEEP IN SYNC comments).

## 18. Settings and tools

`src/components/settings/*`, `src/lib/settings.ts`, `src/store/settings.ts`, `src/lib/themes.ts`, `src/store/theme.ts`, `src/components/tools/*`, `src/store/extensions.ts`, `src/store/tools.ts`, `src/store/writer.ts`, `src-tauri/src/writer.rs`, `src-tauri/src/writer_api.rs`.

- **Settings modal** — tabs Tools, Typography, Themes, General, Sync; Escape or backdrop closes.
- **Typography** — note font (system, serif, mono), font size 12–24, line height 1.2–2.2, Restore Defaults; an unknown saved font is dropped.
- **Themes** — 15 themes; light themes listed first; persisted in `helm-theme`; unknown id falls back to the first theme.
- **General toggles** — Autocomplete wiki links, Auto-save on edit, Show note count on tags, Show archived notes (off), Enable Projects (off), Default note view.
  - There is no pinned-notes toggle; pinned notes always float in the note list. On load, `normalizeSettings` drops any saved key that is not in `DEFAULT_SETTINGS`, including a stale `pinnedNotesFloat`.
  - **Gap:** Show note count on tags is saved but nothing reads it; counts always show.
- **Persistence** — settings in `helm-settings` localStorage; sync prefs live with the vault in the Tauri config.
- **Right-panel extensions** — OpenAI Assistant and Claude Assistant (`src/components/tools/extensions.ts`).
  - Enabling adds the toolbar icon; disabling hides it and keeps connection settings.
  - Shared header: icon, name, status dot (Connected / Not connected), mode, model, menu with Tool settings and Hide from toolbar.
  - Preview only: Send records locally and Connect only changes the panel; no network calls.
- **Writer (Settings → Tools)** — Codex or Claude Code subscription via the local CLI, or API key.
  - Subscription mode strips API-key env vars so it cannot bill the API; there is no fallback between subscription and API in either direction.
  - API keys live in the OS credential store, never localStorage or the vault, and cannot be read back.
  - API mode needs a chosen model; disabling Writer stops a running reply.
  - Writer is not shown in the right panel (`ToolHost` is not mounted).
- **MCP setup** — `McpSetupModal.tsx` builds the Claude Desktop config with `HELM_VAULT` or `HELM_VAULTS` by vault count.
- **GitHub repository** — Helm menu ▸ GitHub (`src/lib/helm-repository.ts`, `src/App.tsx`, `src-tauri/src/lib.rs`).
  - Opens https://github.com/jordanpapaleo/helm in the browser with `openUrl` from the opener plugin.
  - About Helm stays first in that menu, including its version, copyright, and website link. Check for Updates… stays directly under About Helm.
- **Update check** — Helm menu ▸ Check for Updates… (`src/lib/check-for-updates.ts`, `src/App.tsx`, `src-tauri/src/update_check.rs`).
  - The running version is compared with the latest GitHub release. When the app is current, the menu says so.
  - The latest release and the updater manifest are read by `fetch_update_document`. That command follows GitHub's release-download redirect and returns the HTTP status. The manifest URL is `releases/latest/download/latest.json`.
  - A newer signed release is downloaded and installed in place, then Helm relaunches. Pending saves flush before the download and again immediately before relaunch.
  - A GitHub error, including 403, is shown. A network failure and an unreadable release or manifest are shown too.
  - Overlapping checks are ignored.
- **Release history** — `release.sh` still builds the signed, notarized dmg, and publishes `latest.json` plus the signed updater archive on that version's GitHub release. Older GitHub releases remain.

## 19. Quick capture

`src/components/QuickCapture.tsx`, `src/lib/capture.ts`, `src-tauri/src/lib.rs`.

- **Global shortcut** — ⌘⇧Space opens or focuses a 560×200 always-on-top window; a failed shortcut registration is not fatal.
- **Capture** — Enter saves, clears, and hides; Shift+Enter adds a line; Escape hides and keeps the draft.
  - Saves to the first vault's root; with no vault it cannot save.
  - Empty text saves nothing.
  - Title is the first non-empty line, up to 60 characters; filename is `<slug or "capture">-<ms>.md`; `state: Prepare`; tags from inline `#tags`.
- **Window** — label `capture`, listed in capabilities; hidden rather than destroyed.
