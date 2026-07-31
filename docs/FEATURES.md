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
- **Inline formatting**: Bold, italic, strikethrough, inline code, highlight marks (`==text==`)
- **Task lists**: Full checkbox support with visual toggle
- **Image paste**: Paste images directly; they're saved to `vault/assets/` and linked
- **Wiki link autocomplete**: Start typing `[[` to see all notes; select one to insert
- **Locked notes**: When a note is locked, the editor becomes read-only; the delete button is hidden
- **Syntax validation**: Parse errors are caught and reported

The editor respects the user's typography settings (font size, line height, line width) and applies them in real time.

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

Drag cards between quadrants to update `urgent` and `important` frontmatter flags. Changes save immediately to disk. Each quadrant has a `+` button to create a new pre-configured note in that category.

### Kanban Board

A 4-column drag-and-drop workflow board:

- **Prepare**: Initial planning phase
- **Doing**: Currently in progress
- **Maintain**: Completed but needs ongoing attention
- **Done**: Finished

Drag cards between columns to update the `state` frontmatter field. Changes save immediately. Each column has a `+` button to create a new note in that state. Columns automatically fill available width.

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
| `locked` | boolean? | If true, note is read-only in the editor; delete is hidden |
| `pinned` | boolean? | If true, note floats to the top of all lists |

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

- **General**: Preference checkboxes (expandable for future flags)

All settings are persisted to localStorage and applied immediately on change.

### Pinned & Locked Notes

**Pinned notes** float to the top of the note list in all views (sidebar, dashboard filtered lists, etc.). Set via the `pinned` frontmatter field.

**Locked notes** are read-only in the editor:
- Content cannot be edited
- Delete button is hidden
- A lock icon is shown in the editor header
- Useful for archived or reference notes

Set via the `locked` frontmatter field.

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
      SettingsModal.tsx     # Typography and theme controls
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
