/**
 * Reusable note templates.
 *
 * Any note with `template: true` can seed a new note. Instantiation copies the
 * title, the markdown body, and the tags — those describe the kind of note —
 * then stamps a fresh identity.
 *
 * Copied:
 * - title
 * - markdown body
 * - tags
 *
 * Not copied. A new note starts with blank workflow front matter. There is no
 * reason to inherit these from the template:
 * - state, urgent, important, blocked
 * - pinned, locked
 * - links
 * - deadline, team, unmanaged, custom keys, kanbanOrder, eisenhowerOrder
 *
 * The new note keeps its own id, created, and updated. When it comes from a
 * template, `template` is written as false so the copy is not itself a
 * template. A blank note (no template) omits `template` and uses the title
 * "Untitled".
 *
 * Creation context is the only reason to set workflow fields, and it overrides
 * those blank defaults: a Kanban column sets `state`, an Eisenhower cell sets
 * `urgent` / `important`, and a selected sidebar tag is applied. Those come
 * from where the user created the note, never from the template.
 */
import type { Note, NoteFrontmatter, NoteState, VaultConfig } from "../types/note";
import { extractInlineTags } from "./note-parser";

export interface TemplateChoice {
  id: string;
  /** Plain title, or title plus a unique vault/path when that title is not unique. */
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
  /**
   * Project capture sets this for Thinking and Context. Absent leaves the
   * field off the new note (managed).
   */
  unmanaged?: boolean;
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

function vaultFor(note: Note, vaults: VaultConfig[]): VaultConfig | undefined {
  return vaults.find((v) => v.id === note.vaultId);
}

/** Vault display name plus the template's path inside that vault. */
function baseDisambiguator(note: Note, vaults: VaultConfig[]): string {
  const vault = vaultFor(note, vaults);
  return `${vault?.name || "vault"}/${relativePath(note, vault?.path)}`;
}

function pathSuffix(path: string, take: number): string {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return "";
  return segments.slice(-Math.min(take, segments.length)).join("/");
}

/**
 * Lengthen a vault path from the basename until it differs from every peer.
 * Vault names are basenames, so `/home/a/notes` and `/mnt/notes` are both
 * "notes" until a parent segment is included.
 */
function uniqueVaultPrefix(vault: VaultConfig, peers: VaultConfig[]): string {
  const segments = vault.path.split("/").filter(Boolean);
  const limit = Math.max(segments.length, 1);
  for (let take = 1; take <= limit; take++) {
    const suffix = pathSuffix(vault.path, take);
    const collision = peers.some(
      (peer) => peer.id !== vault.id && pathSuffix(peer.path, take) === suffix,
    );
    if (!collision && suffix) return suffix;
  }
  const full = segments.join("/") || vault.name || "vault";
  return `${full} (${vault.id})`;
}

/**
 * Templates currently available to New Note menus.
 * Locked templates are included (they can still be read). Notes that are not
 * flagged, including `template: false`, are not. Callers pass the live note
 * index, so renames, flag changes, and deletions show up on the next read.
 * Identical titles — and a title of "Blank", which would collide with the
 * blank action — are suffixed with vault name and path. When those suffixes
 * still match (two vaults share a basename and the same relative path), the
 * vault path grows parent-by-parent until the labels differ.
 */
export function listTemplateChoices(notes: Note[], vaults: VaultConfig[]): TemplateChoice[] {
  const templates = notes.filter(isTemplateNote);
  const titleCounts = new Map<string, number>();
  for (const note of templates) {
    const title = displayTitle(note);
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }

  const suffixGroups = new Map<string, Note[]>();
  for (const note of templates) {
    const title = displayTitle(note);
    const colliding = (titleCounts.get(title) ?? 0) > 1 || title.toLowerCase() === "blank";
    if (!colliding) continue;
    const key = `${title}\0${baseDisambiguator(note, vaults)}`;
    const group = suffixGroups.get(key) ?? [];
    group.push(note);
    suffixGroups.set(key, group);
  }

  function labelFor(note: Note): string {
    const title = displayTitle(note);
    const colliding = (titleCounts.get(title) ?? 0) > 1 || title.toLowerCase() === "blank";
    if (!colliding) return title;
    const base = baseDisambiguator(note, vaults);
    const group = suffixGroups.get(`${title}\0${base}`) ?? [];
    if (group.length < 2) return `${title} — ${base}`;
    const vault = vaultFor(note, vaults);
    if (!vault) return `${title} — ${base} (${note.vaultId})`;
    const peers = group
      .map((member) => vaultFor(member, vaults))
      .filter((peer): peer is VaultConfig => peer !== undefined);
    return `${title} — ${uniqueVaultPrefix(vault, peers)}/${relativePath(note, vault.path)}`;
  }

  const choices = templates.map((note) => {
    const title = displayTitle(note);
    return {
      id: note.id,
      title,
      vaultId: note.vaultId,
      label: labelFor(note),
    };
  });

  choices.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  return choices;
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
 *
 * `notes` is accepted so callers can pass the live index. Instantiation does
 * not read it: links are not copied and are not resolved from the body.
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
  const { template, id, now, vaultId, folderPath, overrides } = args;
  const applied = overrides ?? {};

  const templateTags = template ? [...template.frontmatter.tags] : [];
  const added = [
    ...(applied.addTags ?? []),
    ...(applied.appendInlineTag ? [applied.appendInlineTag] : []),
  ];
  const tags = [...new Set([...templateTags, ...added])];

  const content = withInlineTag(template?.content ?? "", applied.appendInlineTag);
  const title = applied.title ?? (template ? displayTitle(template) : "Untitled");

  const frontmatter: NoteFrontmatter = {
    id,
    title,
    created: now,
    updated: now,
    tags,
    urgent: applied.urgent ?? false,
    important: applied.important ?? false,
    state: applied.state ?? "Prepare",
    blocked: false,
  };

  if (applied.unmanaged !== undefined) frontmatter.unmanaged = applied.unmanaged;

  if (template) frontmatter.template = false;

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
