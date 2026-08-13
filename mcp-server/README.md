# Helm MCP Server

[![npm](https://img.shields.io/npm/v/helm-mcp)](https://www.npmjs.com/package/helm-mcp)

Exposes your Helm vault(s) to Claude and any other MCP-compatible AI tool. Supports full CRUD, zettelkasten graph navigation, note history with restore, a one-call daily briefing, multi-vault, and built-in prompts for common workflows.

## Add to Claude Code

```bash
claude mcp add helm -- npx -y helm-mcp
```

`HELM_VAULT` is optional — it defaults to `~/notes`, created on first write if it
doesn't exist yet. To point at a specific vault:

```bash
claude mcp add helm --env HELM_VAULT=/absolute/path/to/your/notes -- npx -y helm-mcp
```

## Add to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "helm": {
      "command": "npx",
      "args": ["-y", "helm-mcp"],
      "env": {
        "HELM_VAULT": "/absolute/path/to/your/notes"
      }
    }
  }
}
```

`env` is optional — omit it to use the default `~/notes` vault.

### Running from source

```bash
cd mcp-server
npm install
```

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
| `list_notes` | List notes with rich filtering (tag, state, quadrant, blocked, pinned, overdue, team member, vault) |
| `read_note` | Full content + frontmatter + derived info (wiki links, inline tags, quadrant, overdue) |
| `resolve_note` | Turn a title into a ULID — use before linking |
| `search_notes` | Keyword search across title, content, tags with relevance ranking |
| `get_eisenhower` | Active notes grouped into the 4 Eisenhower quadrants |
| `get_kanban` | All notes grouped by state (Prepare / Doing / Maintain / Done) |
| `get_backlinks` | Find all notes that link TO a given note (inbound references) |
| `get_tag_tree` | Hierarchical tag tree with note counts |

### Write tools

| Tool | Description |
|------|-------------|
| `create_note` | Create a note with full frontmatter support |
| `update_note` | Update content/frontmatter — use `append_tags`/`append_links` to safely add without overwriting |
| `delete_note` | Delete a note (refuses if locked) — a snapshot is saved first, so deletes are recoverable |

### History tools

| Tool | Description |
|------|-------------|
| `get_note_history` | List the saved snapshots (versions) of a note |
| `read_note_version` | Read the full content of a specific snapshot |
| `restore_note_version` | Restore a note to a previous snapshot (the current version is snapshotted first, so restores are undoable) |

### Daily digest

| Tool | Description |
|------|-------------|
| `get_briefing` | One-call daily digest: overdue, due soon (7 days), blocked, doing, and stale Doing notes (untouched 14+ days) |

## Note history

Every `update_note` and `delete_note` first snapshots the note's previous version into `<vault>/.helm-history/<note-id>/` — the same history the Helm app's time machine uses, so versions created by the AI and by the app appear in one timeline. This means:

- **Deletes are recoverable** — the last version is snapshotted before the file is removed.
- **Restores are undoable** — `restore_note_version` snapshots the current version before overwriting, so you can always restore back.

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
pinned: false
deadline: 2026-03-20     # YYYY-MM-DD
team: [Alice, Bob]
links: [01JPMXYZ456]     # ULIDs of related notes
---

Markdown body. Use [[Note Title]] for wiki links and #tag for inline tags.
```

**Key rules:**
- Always use ULIDs as identifiers, never filenames
- Call `resolve_note` before adding to `links`
- `update_note` does a **shallow merge** — use `append_tags`/`append_links` to add without replacing
- `locked: true` notes are read-only — unlock in the Helm app first
