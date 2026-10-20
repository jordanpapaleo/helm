# Helm — Feature Documentation

## Overview

Helm is a personal knowledge management desktop app built with Tauri, React, and TypeScript. It provides a fast, offline-first note-taking system with Zettelkasten-style linking, Eisenhower matrix prioritization, and Kanban-style workflows. Notes are stored as markdown files in a local vault with YAML frontmatter, enabling version control, syncing, and integration with other tools.

## Core Concepts

### Vault
A Vault is a folder of markdown files on your local filesystem. Helm points to a vault directory and loads all `.md` files as notes. Each note is a self-contained file that can be edited, renamed, or moved independently. The vault is the source of truth — all changes to notes persist immediately to disk.

### Notes & Frontmatter
Each note is a markdown file with YAML frontmatter. The frontmatter contains metadata (id, title, created/updated dates, tags, priority flags, state, team, links, etc.) while the body is the markdown content.

Example note file (`vault/my-note.md`):
```yaml
---
id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: My Important Project
created: '2025-03-13T09:14:22Z'
updated: '2025-03-13T09:14:22Z'
tags:
  - work
  - work/project-x
urgent: true
important: true
state: Doing
blocked: false
locked: false
pinned: false
archived: false
team:
  - Alice
  - Bob
deadline: 2025-04-01
links:
  - 01ARZ3NDEKTSV4RRFFQ69G5FB0
  - 01ARZ3NDEKTSV4RRFFQ69G5FB1
---

# Project Overview

This is the main project note. See [[Project Timeline]] and [[Risk Register]].

## Status
Currently in progress. Blocked by #work/dependency-x.
```

### Tags
Tags follow Bear-style hierarchical syntax: `#tag`, `#parent/child`, `#parent/child/grandchild`. Tags can be:
- Defined in the frontmatter `tags` array
- Inline in the markdown content
- Both sources are merged when loading notes

The tag tree in the sidebar shows all tags in a nested hierarchy, allowing you to click a tag to filter the note list.

### Wiki Links
Wiki links use the `[[Note Title]]` syntax. When you type `[[`, an autocomplete popup appears showing all notes. Selecting one inserts the link. On save, wiki links are extracted from the content and stored as ULIDs in the `links` frontmatter field, enabling the graph view to function even if links aren't re-parsed.

## Features

### Note Editor

A TipTap-based rich markdown editor with:

- **Auto-save**: Saves every 1 second (debounced) and on blur to ensure no data loss
- **Markdown syntax**: Full CommonMark + extensions
- **Syntax-highlighted code blocks**: Uses the One Dark color scheme
- **Mermaid diagrams**: ` ```mermaid ` blocks render as diagrams in the editor (bundled, works offline) using the current theme's colors; only the diagram is shown. Open the source with the block's **Edit source** button (or by clicking the diagram); it hides again with **Hide source**, Escape, when the editor loses focus, or when the caret leaves the block. The caret never rests inside hidden source. Invalid diagrams show the parse error. Markdown mode always shows the source, and PDF export shows only the diagram
- **Inline formatting**: Bold, italic, strikethrough, inline code, highlight marks (`==text==`)
- **Task lists**: Full checkbox support with visual toggle
- **Image paste**: Paste images directly; they're saved to `vault/assets/` and linked
- **Wiki link autocomplete**: Start typing `[[` to see all notes; select one to insert
- **Locked notes**: When a note is locked, the editor becomes read-only; the delete button is hidden
- **Syntax validation**: Parse errors are caught and reported

The editor respects the user's typography settings (font size, line height, line width) and applies them in real time.

### Export to PDF

**File → Export to PDF…** (⇧⌘E) or the export button in the note header saves the current note as a PDF, picking the destination in a save dialog. The PDF is the rendered note — title, formatted text and mermaid diagrams as vector graphics — not the markdown source, and it works the same with markdown mode on. It is laid out by the platform's own print engine (WebKit on macOS and Linux), so text stays selectable. Light themes print as they look; dark themes print on the Light palette, because print engines leave page margins white. Windows is not supported yet.

### Sidebar

The left column provides navigation and filtering:

- **Search**: Full-text search across note titles and content
- **Views nav**: Links to Dashboard, Eisenhower, Kanban, and Graph
- **Note filters**: Quick toggles for All Notes, Locked, and Pinned
- **Tag tree**: Hierarchical tag view with counts; click a tag to filter notes
- **Note list**: All notes (or filtered subset), with pinned notes at the top
- **Theme picker**: 6 curated themes with live preview
- **Settings**: Access typography and display preferences

### Dashboard

An analytics and overview view showing:

- **Summary chips**: Count of notes in each Eisenhower quadrant (Do, Schedule, Delegate, Eliminate) plus Blocked and Total
- **Interactive filters**: Click a chip to show only that subset; charts and note list update accordingly
- **Tag distribution**: Pie chart of the top 8 tags in the current subset
- **State distribution**: Pie chart of Kanban states (Prepare, Doing, Maintain, Done)
- **Team distribution**: Pie chart of team member mentions (only if any notes have teams)
- **Note list**: All notes in the active filter with state badge, urgent/blocked indicators, and tags

Clicking a note opens it in the editor.

### Eisenhower Matrix

A 2x2 grid for priority-based task organization:

- **Do** (urgent + important, top-left): Highest priority tasks
- **Schedule** (not urgent + important, top-right): Important but can be planned
- **Delegate** (urgent + not important, bottom-left): Should be passed to others
- **Eliminate** (not urgent + not important, bottom-right): Low-value, skip them

Drag cards between quadrants to update `urgent` and `important` frontmatter flags. Changes save immediately to disk. Each quadrant has a `+` button that opens the same Blank / template menu as New Note and creates a note in that quadrant.

### Kanban Board

A 4-column drag-and-drop workflow board:

- **Prepare**: Initial planning phase
- **Doing**: Currently in progress
- **Maintain**: Completed but needs ongoing attention
- **Done**: Finished

Drag cards between columns to update the `state` frontmatter field. Changes save immediately. Each column has a `+` button that opens the same Blank / template menu as New Note and creates a note in that state. Columns automatically fill available width.

### Graph View

An interactive force-directed graph of note connections:

- **Nodes**: Each note as a blue circle, sized by number of outgoing links
- **Edges**: Lines between notes connected by wiki links (from both saved frontmatter and live content analysis)
- **Pan & zoom**: Standard canvas controls
- **Click nodes**: Select and open a note, switching to the editor view
- **Labels**: Note titles appear when zoomed in enough for readability

The graph is computed on demand from the notes and their link data, updating whenever notes change.

### Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (ULID) | Unique identifier for the note; persists across renames |
| `title` | string | Display name of the note |
| `created` | string (ISO date) | When the note was first created |
| `updated` | string (ISO date) | When the note was last modified |
| `tags` | string[] | Hierarchical Bear-style tags (e.g., `["work", "work/project"]`) |
| `urgent` | boolean | Eisenhower matrix: high time sensitivity |
| `important` | boolean | Eisenhower matrix: high strategic value |
| `state` | string (enum) | Kanban state: "Prepare", "Doing", "Maintain", "Done" |
| `blocked` | boolean | Whether this note is currently blocked from progress |
| `deadline` | string? | Optional deadline as ISO date |
| `team` | string[]? | Optional list of responsible team members |
| `links` | string[]? | Array of ULID references to linked notes (from `[[wiki links]]`) |
| `locked` | boolean? | If true, note is read-only in the editor; delete and archive are hidden |
| `pinned` | boolean? | If true, note floats to the top of all lists |
| `archived` | boolean? | If true, the note is hidden from discovery views. Absent or false means active |

### Themes

Six curated color themes are available, each with semantic colors for background, surface, border, text, muted text, and accent:

- **Midnight**: Dark blue-accented theme (accent: `#0a84ff`)
- **Light**: Bright white surface with blue accent (accent: `#007aff`)
- **Dracula**: Purple-accented dark theme (accent: `#ff79c6`)
- **Nord**: Arctic blue dark theme (accent: `#88c0d0`)
- **Catppuccin**: Lavender dark theme (accent: `#cba6f7`)
- **Tokyo Night**: Indigo dark theme (accent: `#7aa2f7`)

All themes are applied globally via CSS custom properties. Theme selection is persisted to localStorage.

### Settings

User preferences accessible from the sidebar:

- **Typography**:
  - Font size: 12–24 px (default 16 px)
  - Line height: 1.2–2.2 (default 1.7)
  - Line width: 40–100 ch (default 72 ch)
  - Live preview in editor while adjusting

- **Themes**: Card grid to select any of the 6 themes

- **General**: Preference checkboxes, including **Show archived notes** (off by default, persisted in localStorage)

- **Sync**: Optional per-vault Git remote. Off by default, so a vault with no sync settings behaves as before. Connect shows the files that will be uploaded, then Helm can pull on startup and push after local checkpoints. Sync now, Pull, and Push are also on each connected vault in the sidebar. Conflicts keep the local notes and need attention. Sync does not force-push, reset the worktree, or delete untracked files. Replacing the remote or the local copy is a separate recovery action ([#48](https://github.com/jordanpapaleo/helm/issues/48)). Time Machine snapshots in `.helm-history/` stay on this machine.

All settings except sync are persisted to localStorage and applied immediately on change. Sync preferences are stored with the vault in the Tauri config.

### Pinned & Locked Notes

**Pinned notes** float to the top of the note list in all views (sidebar, dashboard filtered lists, etc.). Set via the `pinned` frontmatter field.

**Locked notes** are read-only in the editor:
- Content cannot be edited
- Delete button is hidden
- A lock icon is shown in the editor header
- Archive and delete are unavailable until the note is unlocked
- Useful for reference notes you want to preserve exactly

Set via the `locked` frontmatter field.

### Templates

Any note can be a template. Set `template: true` in its frontmatter, or toggle **Template** in the property panel. There is no template folder and no separate editor — a template is an ordinary note.

**New Note** (the note list, File ▸ New Note, folder **New Note Here**, and the Kanban and Eisenhower `+` buttons) opens a menu. The first item is **Blank**, then every template by title. Identical titles are disambiguated with the vault and path. When two vaults share a name and the same relative path, the label keeps enough parent directories to stay unique. Choosing an entry creates a new note in the current destination (the selected folder, or the vault root). The template file is not modified, and later edits to either note do not affect the other.

Copied from the template:

- title
- markdown body
- `tags` (they describe the kind of note)

Not copied. The new note starts with blank workflow front matter:

- `state`, `urgent`, `important`, `blocked`
- `pinned`, `locked`
- `links`
- `deadline`, `team`, `unmanaged`, custom keys, `kanbanOrder`, `eisenhowerOrder`

The new note keeps its own `id` (a fresh ULID), `created`, and `updated`, and writes `template: false`. A blank note still omits `template` and uses the title `Untitled`.

Creation context is the only reason to set workflow fields, and it overrides those blank defaults. Creating from a Kanban column sets that column's `state`. Creating from an Eisenhower cell sets `urgent` / `important`. A selected sidebar tag is still applied. Those come from where the user created the note, never from the template.

Locked templates can still be used. Notes in Trash are not listed. With no templates, the menu offers Blank only and that choice matches the previous blank-note behavior.

### Projects

Projects are off until **Settings → General → Enable Projects**. Turning the setting off hides project navigation and scoped boards. It does not delete or move project files, and turning it back on restores them.

A project is a folder with `helm-project.json` at its root. The file holds a stable project id and the id of the main page. The folder name is only a label. Clicking a project opens that main page. Expanding it shows the same four folders for every project: Thinking, Features, Bugs, and Context / Docs.

The main page edits purpose, plan / milestone, next action, where work left off, and blockers or decisions, next to a count of that project's Doing and blocked notes. Dashboard, Kanban, and Eisenhower from the project include only that project's notes. **Leave project** in the sidebar clears that filter and returns to the vault-wide Dashboard. Eisenhower, Kanban, the link graph, and the note list are unscoped again after that.

New notes in Thinking and Context / Docs start unmanaged, so they stay off the boards and the daily briefing until you mark them managed. Features and Bugs are a classification, not a commitment: a new note there is not marked Doing. Moving a note between those folders keeps its id, history, links, and workflow fields. Use **Move to category** in the note list.

A repository URL is optional. Home projects and software projects use the same structure, and a project works with no repository at all. On the project page the value is a link when it is an `http`, `https`, or git remote that can be opened in a browser. **Edit** changes the saved value without following the link. An empty value or plain text stays text, and Edit is still available. Promoting an existing folder adds the missing folders and a main page without moving or overwriting notes. A project cannot sit inside another project.

An existing note joins a project from the note list **Move to…** menu. The project and its standard folders are listed there. Choosing one renames the file into that folder. The note id, history, links, and workflow fields stay as they are.

### Archived notes

**Archive** keeps a note for recall without deleting it or changing its workflow. The file, id, content, tags, links, history, and other frontmatter stay where they are. Only `archived: true` is set. Unarchive sets `archived: false` and restores the note to everyday views with that metadata intact.

- The archive action sits next to Delete: an archive icon with the label "Archive note" / "Unarchive note" in the property panel, and Archive / Unarchive in the note-list menu. Both are withheld while the note is locked.
- **Show archived notes** (Settings → General) defaults to off and persists across restarts. It is a UI preference only. The MCP server does not read it; agent tools take their own `include_archived` option and exclude archived notes unless that option is true.
- While the setting is off, archived notes are hidden from lists, search, tag and vault counts, boards, the graph, the dashboard, and the daily briefing. Opening a note you already have selected still works, and shows an Archived mark plus Unarchive.
- While the setting is on, archived notes appear in those views with an Archived mark.
- Existing links stay valid. A visible note can still open an archived note it links to.

### Zettelkasten / Wiki Links

Helm supports Zettelkasten-style note linking with bidirectional reference support:

- **Syntax**: `[[Note Title]]` in note content
- **Autocomplete**: Start typing `[[` and select from a popup
- **Storage**: Links are extracted on save and stored as ULIDs in the `links` frontmatter field
- **Visualization**: Styled with the "wikilink-ref" CSS class; visible as links in the editor
- **Graph edges**: Drive the force-directed graph visualization

Links are bidirectional conceptually (if A links to B, you can see the reference from B's perspective in the sidebar), but storage is directional (only A's `links` field is updated).

## Architecture

### Tech Stack

- **Tauri 2.x**: Rust backend providing file I/O, OS integration; WebKit frontend
- **React 19 + TypeScript**: UI framework with strict type safety
- **Vite**: Fast build tool and dev server
- **Tailwind CSS v4**: Utility-first styling
- **TipTap v3**: ProseMirror-based rich text editor with extensions
- **Zustand**: Lightweight state management for notes, UI, theme, and settings
- **@dnd-kit**: Drag-and-drop primitives for Eisenhower and Kanban boards
- **react-force-graph-2d**: Canvas-based force-directed graph rendering
- **recharts**: Composable charting library for dashboard analytics
- **gray-matter**: YAML frontmatter parsing and serialization
- **lowlight**: Syntax highlighter (used in code blocks)

### State Management

Helm uses Zustand for all global state, split into four focused stores:

1. **notes store** (`src/store/notes.ts`):
   - All loaded notes from the vault
   - Currently selected note ID
   - Hierarchical tag tree for filtering
   - Full-text search index and results
   - Methods: `setNotes`, `selectNote`, `updateNote`, `addNote`, `removeNote`, `search`

2. **ui store** (`src/store/ui.ts`):
   - Active view (dashboard, eisenhower, kanban, graph, notes)
   - Method: `setView`

3. **theme store** (`src/store/theme.ts`):
   - Current theme object
   - Method: `setTheme` (persists to localStorage)

4. **settings store** (`src/store/settings.ts`):
   - Font size, line height, line width
   - Method: `updateSettings` and `resetSettings` (persist to localStorage)

State updates trigger store subscribers (React components) to re-render via hooks.

### File Structure

```
src/
  components/
    editor/
      NoteEditor.tsx        # TipTap editor with auto-save, wiki links, property panel
      PropertyPanel.tsx     # Frontmatter editor (tags, state, priority, etc.)
      BacklinksPanel.tsx    # Show notes linking to current note
      WikiLink.ts           # TipTap extension for [[wiki links]]
    layout/
      MainPanel.tsx         # Editor + property panel
      LeftColumn.tsx        # Sidebar (search, views, tags, note list)
    settings/
      SettingsModal.tsx     # Typography, theme, and Git sync controls
      SyncTab.tsx           # Per-vault remote connect, pull, and push
    sidebar/
      NewNoteButton.tsx     # Create a note
      TagTree.tsx           # Hierarchical tag navigation
      SearchBox.tsx         # Full-text search
      NoteListView.tsx      # Filtered or all notes
  lib/
    note-parser.ts        # parseNote, serializeNote, extractWikiLinks, extractInlineTags
    themes.ts             # Theme definitions and applyTheme
    settings.ts           # Settings interface and applySettings
    search.ts             # Full-text search index and searchNotes
    tauri-commands.ts     # Bindings to Tauri Rust backend (file I/O, vault ops)
    constants.ts          # NOTE_STATES, colors, etc.
  store/
    notes.ts              # Zustand store for notes and tag tree
    ui.ts                 # Zustand store for view selection
    theme.ts              # Zustand store for theme, persisted to localStorage
    settings.ts           # Zustand store for typography settings, persisted
  styles/
    globals.css           # CSS custom properties, base styles
  types/
    note.ts               # Note, NoteFrontmatter, NoteState, EisenhowerQuadrant types
  views/
    DashboardView.tsx     # Overview with summary chips, charts, filtered notes
    EisenhowerView.tsx    # 2x2 priority matrix with drag-and-drop
    KanbanView.tsx        # 4-column workflow board with drag-and-drop
    GraphView.tsx         # Force-directed graph of note connections
  App.tsx                 # Root component, routing, vault init
  main.tsx                # React root, Zustand hydration
```

### Note File Format

Notes are markdown files with YAML frontmatter (delimited by `---`). The structure is:

```markdown
---
id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: Example Note
created: '2025-03-13T09:14:22Z'
updated: '2025-03-13T09:14:22Z'
tags:
  - category/type
  - another-tag
urgent: false
important: true
state: Prepare
blocked: false
locked: false
pinned: false
archived: false
deadline: 2025-04-15
team:
  - Alice
  - Charlie
links:
  - 01ARZ3NDEKTSV4RRFFQ69G5FB0
---

# Heading

This is the markdown body. You can include [[wiki links]] and #inline-tags.

## Subheading

- List item
- Another item

```code block
console.log("syntax highlighted");
```

And more text.
```

Files are stored by title slug (e.g., `example-note.md`) in the vault directory. The `id` (ULID) is the canonical identifier and never changes, even if the title or filename changes.

---

## Quick Start

1. **Open a vault**: Point Helm to an existing folder of markdown files, or create a new one
2. **Create a note**: Click the `+` button in the sidebar
3. **Edit**: Write markdown in the editor; it auto-saves
4. **Organize**: Add tags, set priority, assign to Kanban column
5. **Link**: Type `[[` to reference other notes
6. **Explore**: View connections in the Graph, analyze in the Dashboard

All data stays on your device; Helm is fully offline-capable.

## Workspace panels

A persistent toolbar provides Back/Forward navigation and independent left/right panel toggles in every view. On macOS, it shares the native title bar with the window controls; its empty space can be dragged to move the window. The left panel toggle sits before Back/Forward, and the right panel toggle sits at the far right. Controls use quiet hover feedback without a selected background. The left area includes navigation and, in Notes (including Trash), the note list. The right panel is an empty extension region. Settings remains available through the native menu while navigation is hidden.

Drag the vertical separators to resize each column, or focus a separator and use Left/Right arrows for 10px steps. Panel visibility and completed width changes persist across restarts. Hiding panels preserves the center editor and its pending edits.

At narrow widths Helm reduces panels to their minimum widths, then temporarily hides the right panel followed by the left area to reserve 320px for the center. Explicitly opening either side gives that side priority. Growing the window restores the requested layout and remembered widths.

## Writer tool (subscription prototype)

Open **Settings → Tools**, enable **Writer**, and open the right panel. Choose **Codex · ChatGPT subscription** or **Claude Code · Claude subscription**. Install the corresponding command-line client first; Helm discovers it on PATH and in common macOS/Linux installation locations. The sign-in button launches that client's browser flow. Terminal fallback: `codex login` or `claude auth login`, then **Check connection**.

In Subscription mode, Writer uses the client-owned subscription sign-in and refuses API-key authentication. API-key billing is a separate, explicitly selected connection. Provider plan limits still apply. Recent CLI versions are required for the isolated invocation flags; update the client if a reply ends immediately without output.

Type a message and Send (or Enter; Shift+Enter adds a new line). Writer follows the open note by default. A **Using: Note title** indicator shows which note's latest draft will be sent with your next message; click it to preview the context. Unsaved text is included. Switching notes does not send anything or clear the conversation. Each sent message keeps its note-context snapshot, so earlier notes remain available in the conversation. Turn off **Use open note** for conversation-only messages; earlier context remains until **New chat**. When no note is open, only the conversation is sent.

Replies are plain text/Markdown source, with **Copy** for pasting through the editor. Claude delivers incremental text; the Codex CLI delivers its assistant message when ready. **Stop reply** cancels the native client. Hiding/reopening the right panel preserves the conversation and composer. Disabling Writer cancels a running reply. Conversations are scoped to the active vault and provider and stay in memory for this app session; transcript saving and a recent-chat picker are follow-up work.

The clients run in an app-owned workspace with shell, file, MCP/connector, and other agent tools disabled. They cannot directly modify notes. Explicitly submitted text goes to the selected provider; it is subject to that provider's subscription data controls. Helm's core note editing remains local.


### API-key connections

In **Settings → Tools**, choose OpenAI or Claude, then **Connection → API key · API billing**. Paste a key and click **Save key**. Helm stores the key through the operating system credential store (macOS Keychain / Linux Secret Service), never in localStorage or vault files. The key input clears after saving; keys cannot be read back through the UI. **Remove key** removes that provider's saved credential without affecting subscription sign-in.

Use **Load available models** to fetch the provider catalog, then choose or type a text-generation model ID in **API model**. Catalog loading sends no note content and does not generate a reply. A catalog entry alone does not guarantee inference access. Subscription connections have an optional model field; blank keeps the CLI's default. Model preferences are remembered separately for each provider and connection mode.

The Writer header labels **API billing** and its model. API requests go directly from Rust to the fixed official OpenAI Responses or Anthropic Messages endpoint, with streaming and Stop support. Keys are never sent through a CLI or exposed in stream errors. A failed API request does not retry through a subscription, and subscription requests do not fall back to API billing. API mode needs no installed CLI. Switching providers or billing modes keeps a separate in-memory conversation for each connection; changing the model keeps the current conversation.

Automated checks cover secret-free preferences, key-setup UI, explicit mode/model routing, protocol parsing, errors, and cancellation. Real API inference and OS credential-store prompts require a configured key and remain a manual verification step; Linux Secret Service has not been exercised on the macOS development machine.
