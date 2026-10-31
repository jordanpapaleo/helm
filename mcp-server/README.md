# Helm MCP Server

Exposes your Helm vault(s) to Claude and any other MCP-compatible AI tool. Supports full CRUD, zettelkasten graph navigation, note history with restore, a one-call daily briefing, multi-vault, and built-in prompts for common workflows.

## Setup

```bash
cd mcp-server
npm install
```

## Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "helm": {
      "command": "node",
      "args": ["--import", "tsx/esm", "/absolute/path/to/helm/mcp-server/index.ts"],
      "env": {
        "HELM_VAULT": "/absolute/path/to/your/notes"
      }
    }
  }
}
```

### Multiple vaults

Use `HELM_VAULTS` (comma-separated) instead of `HELM_VAULT`:

```json
"env": {
  "HELM_VAULTS": "/path/to/personal,/path/to/work"
}
```

## Tools

### Read tools

| Tool | Description |
|------|-------------|
| `get_rules` | Vault conventions — call this first in any session |
| `list_notes` | List notes with rich filtering (tag, state, quadrant, blocked, pinned, overdue, team member, vault, `project_id`). Excludes archived notes unless `include_archived` is true. Does not list Trash |
| `read_note` | Full content + frontmatter + derived info (wiki links, inline tags, quadrant, overdue). Works for archived notes by ULID |
| `resolve_note` | Turn a title into a ULID — use before linking. Excludes archived notes unless `include_archived` is true |
| `search_notes` | Keyword search across title, content, tags with relevance ranking. Excludes archived notes unless `include_archived` is true |
| `get_eisenhower` | Managed Prepare/Doing notes grouped into the 4 Eisenhower quadrants. Unmanaged notes are excluded. Pass `project_id` to limit to one project. Excludes archived notes unless `include_archived` is true |
| `get_kanban` | Managed notes grouped by state (Prepare / Doing / Maintain / Done). Unmanaged notes are excluded. Pass `project_id` to limit to one project. Excludes archived notes unless `include_archived` is true |
| `get_backlinks` | Find all notes that link TO a given note (inbound references). Archived sources are excluded unless `include_archived` is true |
| `get_tag_tree` | Hierarchical tag tree with note counts. Counts exclude archived notes unless `include_archived` is true |

### Write tools

| Tool | Description |
|------|-------------|
| `create_note` | Create a note at the vault root. Project sections use `capture_to_thinking` or `move_note_to_category` |
| `update_note` | Update content/frontmatter — use `append_tags`/`append_links` to safely add without overwriting. Does not rebuild `links` from the body |
| `delete_note` | Remove the file (refuses if locked). Not Helm Trash. A snapshot is saved first, but history tools cannot open a note whose file is gone. Prefer `archived: true` |

### History tools

| Tool | Description |
|------|-------------|
| `get_note_history` | List the saved snapshots (versions) of a note that still exists on disk |
| `read_note_version` | Read the full content of a specific snapshot |
| `restore_note_version` | Restore a note to a previous snapshot (the current version is snapshotted first, so restores are undoable) |

### Daily digest

| Tool | Description |
|------|-------------|
| `get_briefing` | One-call daily digest: overdue, due soon (7 days), blocked, doing, and stale Doing notes (untouched 14+ days). Excludes archived notes unless `include_archived` is true. Excludes unmanaged notes. Pass `project_id` to limit the digest to one project |

### Projects

| Tool | Description |
|------|-------------|
| `list_projects` | Discover projects from `helm-project.json`. The id in that file is the identity, not the folder name |
| `get_project` | One project's metadata, main page, and member notes |
| `create_project` | Create thinking/, features/, bugs/, context/, a main page, and metadata. Repository is optional. Refuses a nested project |
| `promote_folder` | Turn an existing folder into a project without moving or overwriting its notes |
| `capture_to_thinking` | Add an unmanaged note to a project's Thinking folder. Not marked Doing |
| `move_note_to_category` | Move a note into thinking, features, bugs, or context. The id, content, links, history, and workflow fields stay put |

## Note history

Every `update_note` and `delete_note` first snapshots the note's previous version into `<vault>/.helm-history/<note-id>/` — the same history the Helm app's time machine uses, so versions created by the AI and by the app appear in one timeline. Snapshots coalesce to one per 5 minutes and 50 are kept. This means:

- **Edits of a note that still exists are recoverable** — `get_note_history`, `read_note_version`, and `restore_note_version` look up the live file. They cannot open a note `delete_note` has already removed, and `delete_note` does not put the note in Helm Trash.
- **Restores are undoable** — `restore_note_version` snapshots the current version before overwriting, so you can restore back. `id` and `locked` are preserved.

## Example prompts

Things you can type in Claude Desktop once connected:

- *"What should I focus on today?"* — `get_briefing`
- *"Capture this idea: try spaced repetition for reading notes"* — `create_note`
- *"What did my Project Alpha note say last week? Restore it if the current version lost the budget section."* — `get_note_history` / `read_note_version` / `restore_note_version`
- *"Find everything blocked and tell me what's blocking it"* — `list_notes`
- *"Summarize my #work/quarterly notes"* — `search_notes` / `list_notes` + `read_note`

## Resources

Every note is exposed as a resource at `note://{ulid}`. AI clients that support MCP resources can read notes directly without tool calls.

## Prompts

Built-in prompt templates for common workflows:

| Prompt | Description |
|--------|-------------|
| `capture` | Quickly capture an idea or task into the vault |
| `daily_standup` | Generate a standup from Doing notes + blockers + overdue |
| `weekly_review` | Full weekly review across all quadrants |
| `project_brief` | Status brief for all notes under a given tag |

## Note conventions

```yaml
---
id: 01JPMXYZ123          # ULID — stable, survives renames
title: My Note
created: '2026-03-13T09:14:22Z'   # UTC, seconds precision — sorts as a string
updated: '2026-03-13T09:14:22Z'   # set automatically on every write
tags: [work, work/project]  # hierarchical with /
urgent: true
important: true
state: Prepare           # Prepare | Doing | Maintain | Done
blocked: false
locked: false            # if true, MCP server refuses all writes
pinned: false            # floats to the top of lists when Pinned notes float is on
archived: false          # true hides the note from default queries; absent or false means active
template: false          # true offers this note in New Note menus
deadline: 2026-03-20     # YYYY-MM-DD — the only date-only field
team: [Alice, Bob]
links: [01JPMXYZ456]     # ULIDs of related notes. The link canvas writes these.
---

Markdown body. Use [[Note Title]] for wiki links and #tag for inline tags.
Write lists as normal Markdown. Do not put blank lines between items — Helm spaces rows itself.
```

**Key rules:**
- Always use ULIDs as identifiers, never filenames. A drag onto a folder renames the file and keeps the id. A drag onto a tag appends the tag and keeps the body.
- Call `resolve_note` before adding to `links`. Put `[[Exact Title]]` in the body as well: the editor rebuilds `links` from wiki links on the next body save, which drops canvas-only edges.
- `created` and `updated` are quoted UTC timestamps (`YYYY-MM-DDTHH:MM:SSZ`). `deadline` stays `YYYY-MM-DD`.
- `update_note` does a **shallow merge** — use `append_tags`/`append_links` to add without replacing. It does not rebuild `links` from the body.
- `locked: true` notes are read-only — unlock in the Helm app first
- `archived: true` keeps the note on disk (same id, file, content, tags, links, and history) but list/search/board/briefing tools skip it unless you pass `include_archived: true`. `read_note` and `update_note` still work by ULID. The Helm app's **Show archived notes** setting does not affect these tools — pass `include_archived` yourself. Set the flag with `update_note` (`frontmatter.archived`); that write is refused when the note is locked. Archive is not Trash and not `state: Done`.
- `unmanaged: true` with `state: ""` keeps a note off Kanban, Eisenhower, and `get_briefing`. Thinking and Context notes start that way.
