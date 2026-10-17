/**
 * Reusable note templates.
 *
 * Any note with `template: true` can seed a new note. Instantiation copies the
 * body and reusable frontmatter defaults, then stamps a fresh identity.
 *
 * Copied:
 * - markdown body
 * - tags, urgent, important, state, blocked, deadline, team, unmanaged
 * - any other frontmatter key not listed below
 *
 * Not copied (fresh or omitted on the new note):
 * - id, title, created, updated
 * - template (a new note is not itself a template)
 * - locked, pinned
 * - kanbanOrder, eisenhowerOrder (board positions)
 * - links (recomputed from `[[wiki links]]` in the copied body)
 *
 * Explicit creation context wins over those defaults: destination vault/folder,
 * a Kanban column's state, an Eisenhower quadrant's urgent/important, and a
 * tag-scoped creation's extra tag. The title stays on the normal creation
 * flow ("Untitled") so the source template is never overwritten.
 */
import type { Note, NoteFrontmatter, NoteState, VaultConfig } from "../types/note";
import { extractInlineTags, extractWikiLinks } from "./note-parser";

/** Frontmatter keys that belong to one note, not to a reusable template. */
export const TEMPLATE_EXCLUDED_FIELDS = [
  "id",
  "title",
  "created",
  "updated",
  "template",
  "locked",
  "pinned",
  "kanbanOrder",
  "eisenhowerOrder",
  "links",
] as const;

const EXCLUDED = new Set<string>(TEMPLATE_EXCLUDED_FIELDS);

export interface TemplateChoice {
  id: string;
  /** Plain title, or title plus vault/path when that title is not unique. */
  label: string;
  title: string;
  vaultId: string;
}

export interface NoteDraftOverrides {
  title?: string;
  state?: NoteState;
  urgent?: boolean;
  important?: boolean;
  /** Tags added on top of the template's tags (for example the selected tag). */
  addTags?: string[];
  /** Inline `#tag` written into the body when the body does not already contain it. */
  appendInlineTag?: string;
}

export function isTemplateNote(note: Note): boolean {
  return note.frontmatter.template === true;
}

function displayTitle(note: Note): string {
  const title = note.frontmatter.title.trim();
  return title || "Untitled";
}

function relativePath(note: Note, vaultPath: string | undefined): string {
  if (!vaultPath) return note.fileName || note.filePath;
  const prefix = vaultPath.endsWith("/") ? vaultPath : `${vaultPath}/`;
  if (note.filePath.startsWith(prefix)) return note.filePath.slice(prefix.length);
  return note.fileName || note.filePath;
}

function disambiguator(note: Note, vaults: VaultConfig[]): string {
  const vault = vaults.find((v) => v.id === note.vaultId);
  const vaultName = vault?.name || "vault";
  return `${vaultName}/${relativePath(note, vault?.path)}`;
}

/**
 * Templates currently available to New Note menus.
 * Locked templates are included (they can still be read). Notes that are not
 * flagged, including `template: false`, are not. Callers pass the live note
 * index, so renames, flag changes, and deletions show up on the next read.
 * Identical titles — and a title of "Blank", which would collide with the
 * blank action — are suffixed with vault and path.
 */
export function listTemplateChoices(notes: Note[], vaults: VaultConfig[]): TemplateChoice[] {
  const templates = notes.filter(isTemplateNote);
  const titleCounts = new Map<string, number>();
  for (const note of templates) {
    const title = displayTitle(note);
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }

  const choices = templates.map((note) => {
    const title = displayTitle(note);
    const colliding = (titleCounts.get(title) ?? 0) > 1 || title.toLowerCase() === "blank";
    return {
      id: note.id,
      title,
      vaultId: note.vaultId,
      label: colliding ? `${title} — ${disambiguator(note, vaults)}` : title,
    };
  });

  choices.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  return choices;
}

function copyValue(value: unknown): unknown {
  return Array.isArray(value) ? [...value] : value;
}

/** Resolve `[[wiki links]]` the same way a normal save does. Empty means omit. */
function resolveLinks(content: string, notes: Note[], selfId: string): string[] | undefined {
  const ids = extractWikiLinks(content)
    .map(
      (title) => notes.find((n) => n.frontmatter.title.toLowerCase() === title.toLowerCase())?.id,
    )
    .filter((id): id is string => id !== undefined && id !== selfId);
  const unique = [...new Set(ids)];
  return unique.length > 0 ? unique : undefined;
}

function withInlineTag(content: string, tag: string | undefined): string {
  if (!tag) return content;
  if (extractInlineTags(content).includes(tag)) return content;
  const line = `#${tag}`;
  if (!content.trim()) return line;
  return `${content.replace(/\n+$/, "")}\n\n${line}\n`;
}

/**
 * Build an unsaved note from a template (or from nothing, when `template` is null).
 * Does not write to disk and does not mutate `template`.
 */
export function instantiateNote(args: {
  template: Note | null;
  notes: Note[];
  id: string;
  now: string;
  vaultId: string;
  folderPath: string;
  overrides?: NoteDraftOverrides;
}): Note {
  const { template, notes, id, now, vaultId, folderPath, overrides } = args;
  const applied = overrides ?? {};

  const copied: Record<string, unknown> = {};
  if (template) {
    for (const [key, value] of Object.entries(template.frontmatter)) {
      if (EXCLUDED.has(key) || value === undefined) continue;
      copied[key] = copyValue(value);
    }
  }

  const templateTags = Array.isArray(copied.tags) ? (copied.tags as string[]) : [];
  const added = [
    ...(applied.addTags ?? []),
    ...(applied.appendInlineTag ? [applied.appendInlineTag] : []),
  ];
  const tags = [...new Set([...templateTags, ...added])];

  const content = withInlineTag(template?.content ?? "", applied.appendInlineTag);
  const links = resolveLinks(content, notes, id);
  const state =
    applied.state ?? (typeof copied.state === "string" ? (copied.state as NoteState) : "Prepare");

  const frontmatter: NoteFrontmatter = {
    ...(copied as Partial<NoteFrontmatter>),
    id,
    title: applied.title ?? "Untitled",
    created: now,
    updated: now,
    tags,
    urgent: applied.urgent ?? (typeof copied.urgent === "boolean" ? copied.urgent : false),
    important:
      applied.important ?? (typeof copied.important === "boolean" ? copied.important : false),
    state,
    blocked: typeof copied.blocked === "boolean" ? copied.blocked : false,
    links,
    template: undefined,
    locked: undefined,
    pinned: undefined,
    kanbanOrder: undefined,
    eisenhowerOrder: undefined,
  };

  delete frontmatter.template;
  delete frontmatter.locked;
  delete frontmatter.pinned;
  delete frontmatter.kanbanOrder;
  delete frontmatter.eisenhowerOrder;

  const slug = id.toLowerCase();
  const folder = folderPath.replace(/\/+$/, "");

  return {
    id,
    filePath: `${folder}/${slug}.md`,
    fileName: `${slug}.md`,
    content,
    vaultId,
    frontmatter,
  };
}
