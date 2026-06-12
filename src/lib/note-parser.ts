/**
 * Note parsing and serialization utilities.
 * Handles conversion between raw markdown files and Note objects, including
 * frontmatter extraction, wiki link parsing, and tag extraction.
 */
import matter from "gray-matter";
import type { Note, NoteFrontmatter } from "../types/note";

/**
 * Parse a raw markdown file into a Note object with frontmatter and content.
 * Uses gray-matter to extract YAML frontmatter and provides sensible defaults
 * for missing fields (generated ULIDs, current date, empty arrays).
 *
 * @param raw - The full markdown file content (with frontmatter)
 * @param filePath - Absolute path to the markdown file on disk
 * @returns Parsed Note with id, frontmatter, content, filePath, and fileName
 */
function extractH1(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

function derivetitleFromFilename(fileName: string): string {
  const base = fileName.replace(/\.md$/i, "") || "Untitled";
  return base.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseNote(raw: string, filePath: string): Note {
  const { data, content } = matter(raw);
  const fileName = filePath.split("/").pop() ?? "";

  const inlineTags = extractInlineTags(content);
  const frontmatterTags: string[] = data.tags ?? [];
  const mergedTags = [...new Set([...frontmatterTags, ...inlineTags])];

  const frontmatter: NoteFrontmatter = {
    id: data.id ?? "",
    title: data.title || extractH1(content) || derivetitleFromFilename(fileName),
    created: data.created ?? new Date().toISOString().split("T")[0],
    updated: data.updated ?? new Date().toISOString().split("T")[0],
    urgent: data.urgent ?? false,
    important: data.important ?? false,
    state: data.state ?? "Prepare",
    blocked: data.blocked ?? false,
    locked: data.locked ?? false,
    pinned: data.pinned ?? false,
    deadline: data.deadline,
    team: data.team,
    links: data.links ?? [],
    ...data, // preserve unknown fields
    tags: mergedTags, // must be after ...data spread to include inline tags
  };

  return { id: frontmatter.id, frontmatter, content, filePath, fileName, vaultId: "" };
}

/**
 * Serialize a Note back to markdown format with YAML frontmatter.
 * Removes undefined values before stringifying to prevent js-yaml errors.
 *
 * @param note - The Note object to serialize
 * @returns Raw markdown string ready to be written to disk
 */
export function serializeNote(note: Note): string {
  const data = Object.fromEntries(
    Object.entries(note.frontmatter).filter(([, v]) => v !== undefined),
  );
  return matter.stringify(note.content, data);
}

/**
 * Extract wiki link targets from note content.
 * Searches for [[Note Title]] syntax. Unescapes escaped brackets from
 * tiptap-markdown serialization before matching.
 *
 * @param content - The markdown content to search
 * @returns Array of unique wiki link target titles (deduplicated)
 * @example
 * extractWikiLinks("Check [[Status]] and [[Review Process]]")
 * // => ["Status", "Review Process"]
 */
export function extractWikiLinks(content: string): string[] {
  const seen = new Set<string>();
  const unescaped = content.replace(/\\\[/g, "[").replace(/\\\]/g, "]");
  for (const match of unescaped.matchAll(/\[\[([^\]]+)\]\]/g)) {
    seen.add(match[1].trim());
  }
  return [...seen];
}

/**
 * Extract Bear-style inline tags from note content.
 * Searches for #tag or #parent/child syntax. Ignores markdown headings
 * by requiring a letter immediately after #. Deduplicates results.
 *
 * @param content - The markdown content to search
 * @returns Array of unique tag names (deduplicated)
 * @example
 * extractInlineTags("Plan #work/project and #personal")
 * // => ["work/project", "personal"]
 */
export function extractInlineTags(content: string): string[] {
  const seen = new Set<string>();
  const matches = content.matchAll(/(?:^|[^a-zA-Z0-9])#([a-zA-Z][a-zA-Z0-9/_-]*)/g);
  for (const match of matches) {
    seen.add(match[1]);
  }
  return [...seen];
}

/**
 * Convert a note title to a URL-safe slug suitable for filenames.
 * Lowercases, removes special characters, normalizes whitespace to hyphens.
 *
 * @param title - The note title to slugify
 * @returns Slugified string
 * @example
 * slugify("My New Note!") // => "my-new-note"
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Generate the file path for a note given a vault directory and title.
 *
 * @param vaultPath - Absolute path to the vault directory
 * @param title - The note title
 * @returns Full file path: vaultPath/slugified-title.md
 */
export function noteFilePath(vaultPath: string, title: string): string {
  return `${vaultPath}/${slugify(title)}.md`;
}
