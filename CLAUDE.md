# Helm — Claude Code Context

Helm is a personal knowledge management desktop app. Tauri 2.x (Rust) for file I/O and OS integration, React 19 + TypeScript + Vite for 100% of the UI. Notes are plain `.md` files with YAML frontmatter stored in a local vault directory.

## Commands

```bash
npm run tauri dev       # start the full app (Rust + React)
npm run dev             # frontend only (no Tauri window)
npm test                # run Vitest tests (includes mcp-server/*.test.ts)
npm run test:watch      # tests in watch mode
npm run test:types      # tsc --noEmit
npm run lint            # biome check (lint:fix to auto-fix)
(cd src-tauri && cargo test)   # Rust unit tests
npm run tauri build     # produce distributable .dmg — but see Releasing
```

Before committing, all four must be green: `npm test`, `npm run test:types`, `npm run lint`, `cargo test`.

## Project Structure

```
src/
  main.tsx          # entry — routes by window label ("main" → App, "capture" → QuickCapture)
  components/
    editor/         # NoteEditor (TipTap), PropertyPanel, NoteHistoryModal, BacklinksPanel, WikiLink extension
    layout/         # LeftColumn (sidebar), MainPanel
    settings/       # SettingsModal
    sidebar/        # TagTree, NewNoteButton
    ErrorBoundary.tsx   # app-wide render-crash fallback
    ToastContainer.tsx  # renders the toast store (see Key Conventions)
    QuickCapture.tsx    # global-shortcut capture window (⌘⇧Space)
  hooks/
    useVault.ts     # vault init, note loading, file watch listener
  lib/
    note-parser.ts  # parseNote, serializeNote, slugify (uses gray-matter)
    tauri-commands.ts # typed wrappers around Tauri invoke calls — the ONLY file I/O path
    briefing.ts     # rules-based daily digest (Dashboard card)
    capture.ts      # quick-capture note builder (pure)
    pending-saves.ts # registry of debounced-save flushers, drained on window close
    themes.ts       # theme definitions + applyTheme
    settings.ts     # settings interface + applySettings
    search.ts       # MiniSearch index builder
  store/
    notes.ts        # Zustand: all notes, selectedNoteId, tagTree, search
    toast.ts        # Zustand: toasts + reportError() helper
    ui.ts / theme.ts / settings.ts
  types/
    note.ts         # Note, NoteFrontmatter, NoteState, EisenhowerQuadrant types
  views/            # DashboardView, EisenhowerView, KanbanView, GraphView
src-tauri/
  src/
    lib.rs          # Tauri entry, menus, global shortcut, command registration
    vault.rs        # commands: list/read/write/delete/rename notes+folders, assets, snapshot_note, list_note_history, watch_vault (+ #[cfg(test)] unit tests)
  capabilities/default.json  # window permission list — new windows MUST be added here
mcp-server/
  index.ts          # MCP server for Claude Desktop — 16 tools incl. note history + get_briefing
  history.ts        # snapshot/list history (KEEP IN SYNC with vault.rs)
  briefing.ts       # daily digest (KEEP IN SYNC with src/lib/briefing.ts)
```

## Data Model

Each note is a `.md` file with YAML frontmatter:

```yaml
---
id: 01JPMXYZ123        # ULID — stable, survives renames
title: My Note
created: '2026-03-13T09:14:22Z'   # UTC datetime, seconds precision
updated: '2026-03-13T09:14:22Z'   # bumped on every write
tags: [work, work/project]
urgent: true
important: true
state: Doing           # Prepare | Doing | Maintain | Done
blocked: false
locked: false          # read-only in editor
pinned: false          # floats to top of lists
links: [01JPMXYZ456]   # ULID refs for zettelkasten graph
---

Markdown content here. You can use [[Wiki Links]] and #inline-tags.
```

## Key Conventions

- **IDs are ULIDs** — never use filenames as identifiers; notes can be renamed
- **Links use IDs** — `links` frontmatter stores ULIDs so renames never break the graph
- **Tauri commands** — all file I/O goes through `src/lib/tauri-commands.ts` (never use `fetch` or `fs` directly in React)
- **State management** — Zustand only; no React context for global state
- **Styling** — Tailwind CSS v4 utility classes + CSS custom properties for theming (`--color-bg`, `--color-surface`, `--color-accent`, etc.)
- **Icons** — offline app: only the bundled `uil` Iconify set works; use `uil:*` names exclusively
- **Auto-save** — editor saves on blur and debounced 1s; always call `serializeNote()` before writing to disk
- **Error surfacing** — never a bare `console.error` in a catch block; use `reportError(message, e)` from `src/store/toast.ts` so failures reach the user as toasts
- **Crash-safe writes** — `write_note` is atomic (temp file + rename) on the Rust side; for renames, write content to the old path first, then rename (see `renameNote` in `src/store/notes.ts`)
- **Note history** — content saves snapshot the previous version to `<vault>/.helm-history/<note-id>/<epoch-ms>.md` (coalesced to 1 per 5 min, 50 kept). Three implementations must stay in sync: `src-tauri/src/vault.rs`, `mcp-server/history.ts`, and the constants they share
- **Parser sync** — `extractInlineTags` exists in both `src/lib/note-parser.ts` and `mcp-server/index.ts`; change one, change both (marked with KEEP IN SYNC comments)
- **Hidden dirs are invisible** — the note scanner and file watcher skip dot-directories (`.helm-history`, `.git`); never store user-visible notes there
- **Debounced saves must register** — anything that debounces a save registers with `src/lib/pending-saves.ts` so edits flush before window close
- **Two windows** — `main` and `capture`; a new window label must be added to `src-tauri/capabilities/default.json` or its `invoke` calls silently fail
- **Search index** — any store action that adds/removes notes must rebuild `searchIndex` (`buildIndex`), or new notes are unfindable
- **Testing** — TDD is the norm here: co-located `*.test.ts(x)` via Vitest (jsdom), Rust `#[cfg(test)]` in vault.rs, MCP tests in `mcp-server/*.test.ts` run by the root Vitest

## Themes

15 themes available via the theme store (see the theme list in `src-tauri/src/lib.rs` menus). Apply by calling `applyTheme(theme)` which sets CSS custom properties on `:root`. Theme persists to localStorage.

## MCP Server

`mcp-server/` is a standalone Node.js MCP server for Claude Desktop (run via `node --import tsx/esm index.ts`). It reads/writes the vault directly via the filesystem (not through Tauri). Configured via `HELM_VAULT` (single) or `HELM_VAULTS` (comma-separated) env vars. Register in `~/Library/Application Support/Claude/claude_desktop_config.json`.

16 tools: reads (list/read/resolve/search/eisenhower/kanban/backlinks/tag-tree/rules), writes (create/update/delete — update and delete snapshot the previous version to `.helm-history/` first), history (get_note_history / read_note_version / restore_note_version), and `get_briefing` (daily digest). It writes to the vault root only (no folder support yet). Smoke-test it over stdio by piping JSON-RPC `initialize` + `tools/list` lines into the process.

## Releasing

**Always use `release.sh` — never bump versions or run `npm run tauri build` manually.**

```bash
./release.sh patch   # 0.3.0 → 0.3.1
./release.sh minor   # 0.3.0 → 0.4.0
./release.sh major   # 0.3.0 → 1.0.0
```

Full process is documented in `CONTRIBUTING.md` under the **Releasing** section.

## Docs

- `docs/plans/2026-03-13-helm.md` — original implementation plan (fully executed)
- `docs/plans/2026-03-13-helm-design.md` — design document
- `docs/FEATURES.md` — full feature documentation
