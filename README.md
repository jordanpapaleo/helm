# Helm

Helm is a personal knowledge management app for macOS and Linux. Notes are plain markdown files with YAML frontmatter stored in a folder on your computer — your **vault**. Helm never touches a server; everything stays on your device.

---

## Getting Started

### 1. Install

**macOS:** 

Download the [latest `.dmg`](../../releases/latest/download/Helm_aarch64.dmg) from the [Releases](../../releases) page, open it, and drag Helm to your Applications folder.

**Linux (Debian/Ubuntu):** 

Download [`Helm_amd64.deb`](../../releases/latest/download/Helm_amd64.deb) from the [Releases](../../releases) page, then `sudo dpkg -i Helm_amd64.deb`.

### 2. Open a vault

On first launch, Helm will ask you to choose a vault folder. This can be:

- An existing folder of `.md` files (Obsidian vaults work out of the box)
- A new empty folder you create for the occasion

Helm watches the folder for changes, so files edited externally (in your terminal, another editor, or synced from another device) will reload automatically.

### 3. Create your first note

Click the **+** button at the top of the sidebar, give your note a title, and start writing. Helm auto-saves every second and on blur — you never need to save manually.

---

## The Interface

```
┌─────────────────┬──────────────────────────────────────────┐
│   Sidebar       │   Main Panel                             │
│                 │                                          │
│  Search         │   Note Editor                            │
│  Views nav      │   (or Dashboard / Eisenhower /           │
│  Tag tree       │    Kanban / Graph)                       │
│  Note list      │                                          │
│  Theme picker   │                                          │
│  Settings       │                                          │
└─────────────────┴──────────────────────────────────────────┘
```

### Sidebar

- **Search** — Full-text search across all note titles and content. Results appear instantly as you type.
- **Views** — Switch between the five main views: Notes, Dashboard, Eisenhower, Kanban, and Graph.
- **Filters** — Quick toggles to show All Notes, Locked notes only, or Pinned notes only.
- **Tag tree** — All tags from your vault displayed as a nested hierarchy with counts. Click any tag to filter the note list to just that tag (and its children).
- **Note list** — Your notes, with pinned notes always at the top. Click a note to open it.
- **Theme & Settings** — At the bottom of the sidebar, access theme selection and display preferences.

---

## Writing Notes

Helm uses a rich markdown editor with live formatting. You write in markdown and see it rendered inline.

### Markdown support

- Headings (`#`, `##`, `###`)
- Bold (`**text**`), italic (`*text*`), strikethrough (`~~text~~`), inline code (`` `code` ``)
- Highlight marks (`==text==`)
- Ordered and unordered lists
- Task lists (`- [ ] item`, `- [x] done`)
- Fenced code blocks with syntax highlighting
- Images (paste from clipboard — saved automatically to `vault/assets/`)

### Linking notes

Type `[[` anywhere in a note to open the wiki link autocomplete. Start typing a note title and select it from the popup. The link renders inline and is stored as a stable ID reference — so renaming a note never breaks its links.

Example: `See also [[Project Timeline]] for the full schedule.`

### Tags

Add tags in the frontmatter or inline in the body with `#tag` syntax. Tags support nested hierarchies: `#work/project-x` appears under `work` in the sidebar tag tree.

### Note properties

The **Property Panel** (accessible from the editor) lets you edit a note's metadata without touching the frontmatter directly:

- Title and tags
- Kanban state (Prepare / Doing / Maintain / Done)
- Priority flags (Urgent, Important)
- Blocked status
- Deadline and team members
- Locked and Pinned toggles

---

## Views

### Dashboard

An overview of your entire vault at a glance.

- **Summary chips** — counts for each Eisenhower quadrant (Do, Schedule, Delegate, Eliminate), plus Blocked and Total. Click any chip to filter the view to that subset.
- **Charts** — Pie charts for tag distribution, Kanban state breakdown, and team member distribution (when applicable).
- **Note list** — The notes matching the active filter, with state badges and priority indicators.

### Eisenhower Matrix

A 2×2 grid for prioritizing work by urgency and importance.

| | Important | Not Important |
|---|---|---|
| **Urgent** | Do | Delegate |
| **Not Urgent** | Schedule | Eliminate |

Drag cards between quadrants to update their priority flags. Each quadrant has a **+** button to create a new note pre-configured for that category.

### Kanban Board

A four-column workflow board tracking notes through stages:

| Prepare | Doing | Maintain | Done |
|---------|-------|----------|------|
| Planning phase | In progress | Ongoing attention | Complete |

Drag cards between columns to change their state. Each column has a **+** to add a note directly into that stage.

### Graph View

An interactive, force-directed visualization of how your notes connect to each other.

- Each **node** is a note; size reflects how many links it has.
- Each **edge** is a `[[wiki link]]` between two notes.
- **Pan** by clicking and dragging the background.
- **Zoom** with the scroll wheel.
- **Click a node** to open that note in the editor.

Labels appear as you zoom in. Highly connected notes become visible hubs, helping you discover clusters of related thinking.

---

## Organizing Notes

### Tags

Tags are hierarchical. A note tagged `work/project-x` automatically appears under both `work` and `work/project-x` in the sidebar tag tree. Use nesting to create topic areas without manual folders.

### Pinned notes

Set `pinned: true` in a note's properties (or frontmatter) to float it to the top of every list. Good for reference notes, daily logs, or anything you return to constantly.

### Locked notes

Set `locked: true` to make a note read-only. The editor disables editing, the delete button is hidden, and a lock icon appears in the header. Useful for archived decisions, templates, or notes you want to preserve exactly.

### Blocked notes

Mark a note as `blocked: true` to flag that it's waiting on something external. Blocked notes appear with a visual indicator in the sidebar and Dashboard.

---

## Frontmatter Reference

Every note is a plain `.md` file. Helm stores metadata in YAML frontmatter between `---` delimiters:

```markdown
---
id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: My Note
created: 2025-03-13
updated: 2025-03-13
tags:
  - work
  - work/project-x
urgent: true
important: true
state: Doing
blocked: false
locked: false
pinned: false
deadline: 2025-04-01
team:
  - Alice
  - Bob
links:
  - 01ARZ3NDEKTSV4RRFFQ69G5FB0
---

Note body goes here. [[Wiki links]] and #inline-tags work anywhere.
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | ULID | Stable unique identifier; survives renames |
| `title` | string | Display name |
| `created` / `updated` | ISO date | Auto-managed by Helm |
| `tags` | string[] | Hierarchical tags |
| `urgent` | boolean | Eisenhower: high time sensitivity |
| `important` | boolean | Eisenhower: high strategic value |
| `state` | enum | `Prepare` \| `Doing` \| `Maintain` \| `Done` |
| `blocked` | boolean | Waiting on an external dependency |
| `locked` | boolean | Read-only in editor; hides delete button |
| `pinned` | boolean | Floats to top of all lists |
| `deadline` | ISO date | Optional due date |
| `team` | string[] | Optional team members |
| `links` | ULID[] | Auto-populated from `[[wiki links]]` in body |

You can edit the frontmatter directly in any text editor — Helm will pick up the changes automatically.

---

## Themes

Six built-in themes, selectable from the bottom of the sidebar:

| Theme | Style |
|-------|-------|
| **Midnight** | Dark, blue accent |
| **Light** | Bright white, blue accent |
| **Dracula** | Dark, pink/purple accent |
| **Nord** | Dark, arctic blue accent |
| **Catppuccin** | Dark, lavender accent |
| **Tokyo Night** | Dark, indigo accent |

Your theme choice is saved automatically.

---

## Settings

Access settings from the gear icon in the sidebar.

**Typography**
- **Font size** — 12–24 px (default 16 px)
- **Line height** — 1.2–2.2 (default 1.7)
- **Line width** — 40–100 characters (default 72)

Changes apply live in the editor as you adjust them.

---

## Your Data

- All notes are plain `.md` files — readable and editable with any text editor.
- Compatible with Obsidian vaults and other tools that use the `[[wiki link]]` convention.
- Sync with iCloud Drive, Dropbox, or git — just point Helm at your synced folder.
- No account, no cloud, no telemetry.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to build Helm from source.
