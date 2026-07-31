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
 * Normalize note content for change detection.
 * gray-matter reintroduces a leading "\n" when a file is parsed back off disk,
 * and editors round-trip trailing blank lines inconsistently, so content that
 * differs only at the edges is not a real modification.
 *
 * @param content - Raw note body
 * @returns The body with leading/trailing newlines stripped
 */
export function normalizeContent(content: string): string {
  return content.replace(/^\n+|\n+$/g, "");
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
 * Matches 3- or 6-digit hex color values (e.g. fff, ff0000), so `#fff` reads
 * as a color rather than a tag.
 *
 * Safe to share as a single instance: it has no `g` flag, so `test()` never
 * advances `lastIndex` and callers cannot interfere with each other.
 */
export const HEX_COLOR_RE = /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/;

/**
 * Build a fresh global pattern matching an inline tag and the boundary
 * character in front of it. Capture group 1 is the tag name.
 *
 * A factory rather than a shared constant on purpose: the pattern carries the
 * `g` flag and is driven by `exec`/`matchAll` loops, so a single shared
 * instance would let one caller's `lastIndex` leak into another's iteration.
 * Every caller gets its own object.
 *
 * This is the single source of truth for what the app considers a tag —
 * `extractInlineTags` (storage) and the editor's inline-tag decorations
 * (presentation) both build from it, so the two can never disagree.
 *
 * @returns A new global RegExp; never reuse one across concurrent loops
 */
export function createTagPattern(): RegExp {
  return /(?:^|[^a-zA-Z0-9])#([a-zA-Z][a-zA-Z0-9/_-]*)/g;
}

// KEEP IN SYNC with mcp-server/index.ts extractInlineTags — the app and the
// MCP server must agree on what counts as a tag or vault writes will drift.
// (The MCP server keeps its own copy deliberately: it never imports from src/.)
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
  // Strip fenced code blocks and inline code so their content never produces tags
  const stripped = content.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");

  const seen = new Set<string>();
  for (const match of stripped.matchAll(createTagPattern())) {
    if (!HEX_COLOR_RE.test(match[1])) {
      seen.add(match[1]);
    }
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
