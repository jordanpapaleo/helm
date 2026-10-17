# Helm — Agent Reference

Helm is an offline-first personal knowledge management app. Notes are plain `.md` files with YAML frontmatter stored in a local vault directory. An agent can read and write notes directly by reading and writing files in that vault.

The vault path is configured by the user. Check the `HELM_VAULT` environment variable, or ask the user where their vault is.

---

## Note File Format

Every note is a `.md` file. The filename is a slug derived from the title (e.g., `my-important-project.md`). The file has two parts: a YAML frontmatter block delimited by `---`, followed by markdown content.

```markdown
---
id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: My Important Project
created: 2026-01-01
updated: 2026-01-15
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
deadline: 2026-04-01
links:
  - 01ARZ3NDEKTSV4RRFFQ69G5FB0
---

# My Important Project

Note content in standard markdown. You can reference other notes with [[Wiki Link Title]] and use #inline-tags.
```

---

## Frontmatter Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string (ULID) | yes | Stable unique identifier. Never changes, even if the note is renamed. |
| `title` | string | yes | Display name of the note. |
| `created` | string (ISO date) | yes | Creation date, e.g. `2026-01-01`. |
| `updated` | string (ISO date) | yes | Last modified date. Update this every time you write the note. |
| `tags` | string[] | no | Hierarchical tags (see Tags section). |
| `urgent` | boolean | no | Eisenhower matrix: time-sensitive. Default `false`. |
| `important` | boolean | no | Eisenhower matrix: strategically valuable. Default `false`. |
| `state` | string (enum) | no | Kanban state. One of: `Prepare`, `Doing`, `Maintain`, `Done`. |
| `blocked` | boolean | no | Whether the note is blocked from progress. Default `false`. |
| `locked` | boolean | no | If `true`, the note is read-only in the UI. Default `false`. |
| `pinned` | boolean | no | If `true`, the note floats to the top of all lists. Default `false`. |
| `template` | boolean | no | If `true`, Helm offers this note in New Note menus. Absent means false. |
| `deadline` | string (ISO date) | no | Optional deadline. |
| `team` | string[] | no | Optional list of responsible people. |
| `links` | string[] | no | ULIDs of notes this note links to (populated from `[[wiki links]]` on save). |

---

## IDs (ULIDs)

Every note has a ULID as its `id`. ULIDs are 26-character uppercase strings like `01ARZ3NDEKTSV4RRFFQ69G5FAV`.

- **Never use the filename as an identifier.** Notes can be renamed; the `id` is stable.
- When creating a new note, generate a ULID. Libraries exist for every language; you can also generate one as: timestamp in milliseconds (48 bits) + 80 random bits, encoded in Crockford Base32.
- The `links` field stores the ULIDs of linked notes, not their titles or filenames.

---

## Templates

A note with `template: true` is a reusable starting point. Helm copies its title, body, and tags into a **new** note. Do not edit the template to "fill it in."

Copied: title, body, and `tags` (they describe the kind of note).

Not copied: `state`, `urgent`, `important`, `blocked`, `pinned`, `locked`, and `links`. The new note starts with blank workflow front matter. It keeps its own `id`, `created`, and `updated`, and sets `template: false`. Deadline, team, unmanaged, custom keys, and board order are not inherited either.

Creation context is the only reason to set workflow fields, and it overrides those blank defaults: a Kanban column sets `state`, an Eisenhower cell sets `urgent` / `important`, and a selected sidebar tag is applied. Those come from where the note was created, never from the template.

Preserve a `template` key you did not mean to change. `update_note` shallow-merges it like any other safe field.

## Tags

Tags use Bear-style hierarchical syntax. A tag `work/project-x` implies the parent tag `work`.

- In frontmatter, tags are a YAML string array: `tags: ["work", "work/project-x"]`
- In note content, tags can appear inline as `#work` or `#work/project-x`
- Both frontmatter and inline tags are merged when Helm loads a note
- Tag hierarchy is displayed as a nested tree in the sidebar

---

## Linking Notes

Use `[[Note Title]]` syntax in the note body to link to another note by title.

When Helm saves a note, it:
1. Extracts all `[[wiki link]]` references from the content
2. Resolves them to ULIDs by looking up note titles in the vault
3. Writes those ULIDs into the `links` frontmatter field

As an agent writing notes directly:
- Write `[[Note Title]]` links in the markdown body as normal
- Also populate the `links` field yourself with the target note's ULID if you know it — this ensures the graph view works even before Helm re-processes the file
- Backlinks (notes linking *to* a given note) are computed at load time — you don't need to update the target note

---

## Kanban States

The `state` field maps to the Kanban board columns:

| Value | Meaning |
|---|---|
| `Prepare` | Planning / not started |
| `Doing` | In progress |
| `Maintain` | Completed but needs ongoing attention |
| `Done` | Finished |

If `state` is absent, the note does not appear on the Kanban board.

---

## Eisenhower Priority

Two boolean fields determine where a note appears in the Eisenhower matrix:

| `urgent` | `important` | Quadrant |
|---|---|---|
| `true` | `true` | **Do** — highest priority, act now |
| `false` | `true` | **Schedule** — plan it |
| `true` | `false` | **Delegate** — pass it on |
| `false` | `false` | **Eliminate** — low value |

If both fields are absent or `false`/`false`, the note appears in Eliminate.

---

## Status Flags

| Flag | Effect |
|---|---|
| `blocked: true` | Shown with a blocked indicator in dashboards and lists |
| `locked: true` | Read-only in the editor; delete button hidden in UI |
| `pinned: true` | Floats to the top of all note lists and filtered views |

---

## Creating a Note

1. Generate a ULID for the `id` field.
2. Set `created` and `updated` to today's date (ISO format: `YYYY-MM-DD`).
3. Set `title` to the note's display name.
4. Slug the title for the filename: lowercase, spaces to hyphens, strip special characters (e.g., `My Note` → `my-note.md`).
5. Write the file to the vault directory.
6. Helm's file watcher will detect the new file and load it automatically.

Minimum valid note:

```markdown
---
id: 01ARZ3NDEKTSV4RRFFQ69G5FAV
title: My Note
created: 2026-01-01
updated: 2026-01-01
---

Note content here.
```

---

## Updating a Note

1. Read the existing file from disk.
2. Parse the YAML frontmatter.
3. Make your changes to frontmatter fields and/or the markdown body.
4. Set `updated` to today's date.
5. Serialize back to `---\n<yaml>\n---\n\n<body>` and write the file.

Always preserve all existing frontmatter fields you're not intentionally changing.

---

## Reading the Vault

To load all notes, read every `.md` file in the vault directory **recursively** — Helm supports nested folder structures like `docs/features/my-feature/thing.prd.md`. Parse each file's YAML frontmatter with any standard gray-matter-compatible parser.

The `id` field is the canonical identifier for cross-referencing notes. Build a lookup map of `id → note` after loading.

---

## File Naming and Folders

- Filename = slugified title + `.md`
- Slug: lowercase, spaces → hyphens, strip punctuation except hyphens
- Example: `"Q1 Planning: Goals & OKRs"` → `q1-planning-goals-okrs.md`
- Nested folders are fully supported: `docs/features/my-feature/thing.prd.md`
- If a slug collision exists, append a short suffix
- The filename is **not** the identifier — always use the `id` ULID

---

## Inline Tags in Content

Tags can appear anywhere in the markdown body as `#tagname` or `#parent/child`. Helm merges these with the `tags` frontmatter array at load time. You don't need to duplicate them in frontmatter, but it's fine if you do.
