import { useGitSyncStore } from "../store/git-sync";
import { useNoteStore } from "../store/notes";
import { reportError } from "../store/toast";
import type { Note } from "../types/note";
import {
  extractInlineTags,
  extractWikiLinks,
  normalizeContent,
  serializeNote,
} from "./note-parser";
import {
  enqueueNoteWrite,
  hasInflightNoteWrite,
  immediateNoteWritePath,
  resolveNoteWritePath,
  takeScheduledPath,
} from "./note-write-path";
import { mergeTagsOnSave } from "./tags";
import { tauriCommands } from "./tauri-commands";
import { nowTimestamp } from "./timestamps";

export type SaveNoteResult = "unchanged" | "blocked" | "failed" | "saved";

const reportedSyncHolds = new Set<string>();

/**
 * Bodies this session has submitted and the editor has not yet observed.
 * An earlier write finishing under a newer edit must not look like a sync
 * conflict. The editor peeks, then drops the entry on a microtask so React
 * StrictMode can run the effect twice and still see it.
 */
const localBodies = new Map<string, Set<string>>();

function bodyKey(content: string): string {
  return normalizeContent(content);
}

function addLocalBody(noteId: string, content: string) {
  const key = bodyKey(content);
  let bodies = localBodies.get(noteId);
  if (!bodies) {
    bodies = new Set();
    localBodies.set(noteId, bodies);
  }
  bodies.add(key);
}

function dropLocalBody(noteId: string, content: string) {
  const bodies = localBodies.get(noteId);
  if (!bodies) return;
  bodies.delete(bodyKey(content));
  if (bodies.size === 0) localBodies.delete(noteId);
}

/** True when `content` is a body save from this session that the editor has not consumed. */
export function isLocalBodyEcho(noteId: string, content: string): boolean {
  return localBodies.get(noteId)?.has(bodyKey(content)) ?? false;
}

export function acknowledgeLocalBody(noteId: string, content: string): void {
  dropLocalBody(noteId, content);
}

function sameList(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === right) return true;
  if (!left && !right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

/**
 * The body write finished. Keep frontmatter and body edits that landed in the
 * store while `writeNote` was in flight; the snapshot this save started from
 * does not include them.
 */
function reconcileSavedBody(started: Note, written: Note): Note {
  const current = useNoteStore.getState().notes.find((item) => item.id === started.id);
  if (!current) return written;
  const content = current.content === started.content ? written.content : current.content;
  const frontmatter = { ...current.frontmatter };
  if (sameList(current.frontmatter.tags, started.frontmatter.tags)) {
    frontmatter.tags = written.frontmatter.tags;
  }
  if (sameList(current.frontmatter.links, started.frontmatter.links)) {
    frontmatter.links = written.frontmatter.links;
  }
  if (current.frontmatter.updated === started.frontmatter.updated) {
    frontmatter.updated = written.frontmatter.updated;
  }
  const pathMoved = current.filePath !== started.filePath;
  return {
    ...current,
    content,
    filePath: pathMoved ? current.filePath : written.filePath,
    fileName: pathMoved ? current.fileName : written.fileName,
    frontmatter,
  };
}

function reportSyncHold(noteId: string) {
  if (reportedSyncHolds.has(noteId)) return;
  reportedSyncHolds.add(noteId);
  reportError(
    "Sync kept this note",
    new Error(
      "Your latest edits are still in the editor and were not written over the synced file.",
    ),
  );
}

// Drive-letter and UNC paths. A URL pathname for a drive is `/C:\...` or `/C:/...`.
// On macOS and Linux `\` is a filename character, so it is not a separator there.
function isWindowsPath(input: string): boolean {
  return (
    /^[A-Za-z]:[\\/]/.test(input) || /^\/[A-Za-z]:[\\/]/.test(input) || input.startsWith("\\\\")
  );
}

// Absolute path with trailing slashes stripped, or null when it is relative
// or contains `..`. Backslashes stay literal except in a Windows path.
function absolutePath(input: string): string | null {
  let path = isWindowsPath(input) ? input.replaceAll("\\", "/") : input;
  if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
  if (path.length > 1) path = path.replace(/\/+$/, "");
  const isAbsolute = path.startsWith("/") || /^[A-Za-z]:\//.test(path);
  if (!isAbsolute || path.split("/").includes("..")) return null;
  return path;
}

// Normalized path of a file strictly inside `<vaultPath>/assets`, or null.
// A sibling such as `<vault>/assets-evil` does not match, and a decoded
// `%2F..%2F` traversal does not either.
function vaultAssetFile(vaultPath: string, assetPath: string): string | null {
  const vault = absolutePath(vaultPath);
  const asset = absolutePath(assetPath);
  if (!vault || !asset) return null;
  const prefix = `${vault}/assets/`;
  if (!asset.startsWith(prefix)) return null;
  const relative = asset.slice(prefix.length);
  if (!relative.split("/").every((segment) => segment !== "" && segment !== ".")) return null;
  return asset;
}

// Extract asset files referenced by markdown images, limited to this vault's
// assets directory.
// http://asset.localhost/Users/foo/notes/assets/img.png → /Users/foo/notes/assets/img.png
function extractAssetPaths(content: string, vaultPath: string | null): Set<string> {
  const paths = new Set<string>();
  if (!vaultPath) return paths;
  for (const match of content.matchAll(/!\[.*?\]\(([^)]+)\)/g)) {
    const src = match[1];
    try {
      const url = new URL(src);
      if (url.hostname !== "asset.localhost") continue;
      const assetPath = vaultAssetFile(vaultPath, decodeURIComponent(url.pathname));
      if (assetPath) paths.add(assetPath);
    } catch {
      /* not a URL, skip */
    }
  }
  return paths;
}

/**
 * Persist a note body the way the main editor does: skip unchanged text, keep
 * tags and wiki links in sync, snapshot the previous file, and write atomically.
 *
 * The main editor and the pinned-note editor both call this so a side-panel
 * edit cannot drift from the primary save path.
 */
export async function saveNoteContent(note: Note, content: string): Promise<SaveNoteResult> {
  const enqueuedPath = takeScheduledPath(note.id, note.filePath);
  const vaultPath =
    useNoteStore.getState().vaults.find((vault) => vault.id === note.vaultId)?.path ?? null;
  if (useGitSyncStore.getState().isWriteBlocked(note.id, vaultPath)) {
    useGitSyncStore.getState().preserveHeldDraft(note.id, content);
    reportSyncHold(note.id);
    return "blocked";
  }

  // Opening, focusing, or blurring a note is not a modification. Bail before
  // touching disk so viewing a note never bumps `updated`. Edge newlines are
  // normalized away because gray-matter reintroduces a leading "\n" on parse,
  // so a strict === would let those phantom saves through.
  // A write already in flight still has the old body in the store. An undo
  // back to that text must be queued, or the in-flight write lands the edit
  // and the undo never runs. The queued task compares again when it starts.
  if (
    !hasInflightNoteWrite(note.id) &&
    normalizeContent(content) === normalizeContent(note.content)
  ) {
    return "unchanged";
  }

  return enqueueNoteWrite(note.id, () => persistNoteContent(note, content, enqueuedPath));
}

async function persistNoteContent(
  note: Note,
  content: string,
  enqueuedPath: string,
): Promise<SaveNoteResult> {
  const latest = useNoteStore.getState().notes.find((item) => item.id === note.id) ?? note;
  const vaultPath =
    useNoteStore.getState().vaults.find((vault) => vault.id === latest.vaultId)?.path ?? null;
  if (normalizeContent(content) === normalizeContent(latest.content)) return "unchanged";

  // The store path may already be a slug nothing has created. Overwrite the
  // file that exists, and never call write_note on a path that is not one.
  const path =
    immediateNoteWritePath(latest.id, enqueuedPath) ??
    (await resolveNoteWritePath(latest.id, enqueuedPath));
  if (!path) {
    reportError("Failed to save note", new Error("The note file is not on disk"));
    return "blocked";
  }

  // Time machine: snapshot the current on-disk content before overwriting.
  // Rust coalesces rapid autosaves (min 5 min between snapshots) and prunes
  // old versions, so this is safe to fire on every save.
  if (vaultPath) {
    tauriCommands.snapshotNote(vaultPath, latest.id, path).catch(() => {
      /* snapshotting must never block a save */
    });
  }

  // Tags are merged, never recomputed. Reading a note unions the frontmatter
  // list with the body's inline tags, so recomputing from the body alone
  // would delete every tag set from the property panel and never typed as
  // `#tag`. Comparing the pre-save body with the incoming one tells us which
  // tags the user actually removed. See mergeTagsOnSave.
  const notes = useNoteStore.getState().notes;
  const mergedTags = mergeTagsOnSave(
    latest.frontmatter.tags,
    extractInlineTags(latest.content),
    extractInlineTags(content),
  );
  const wikiTitles = extractWikiLinks(content);
  const linkedIds = wikiTitles
    .map(
      (title) =>
        notes.find((item) => item.frontmatter.title.toLowerCase() === title.toLowerCase())?.id,
    )
    .filter((id): id is string => id !== undefined && id !== latest.id);

  const updated = {
    ...latest,
    filePath: path,
    fileName: path.split("/").pop() ?? latest.fileName,
    content,
    frontmatter: {
      ...latest.frontmatter,
      tags: mergedTags,
      links: linkedIds.length > 0 ? linkedIds : undefined,
      updated: nowTimestamp(),
    },
  };
  addLocalBody(latest.id, content);
  try {
    await tauriCommands.writeNote(path, serializeNote(updated));
  } catch (e) {
    // Leave the store on the previous body. Updating it here would make the
    // next save look unchanged, so the failed write would never be retried.
    dropLocalBody(latest.id, content);
    reportError("Failed to save note", e);
    return "failed";
  }
  useNoteStore.getState().updateNote(reconcileSavedBody(latest, updated));

  // Delete asset files removed from this note since the last save. Only paths
  // inside this vault's assets directory are eligible; anything else is ignored.
  const oldPaths = extractAssetPaths(latest.content, vaultPath);
  const newPaths = extractAssetPaths(content, vaultPath);
  if (vaultPath) {
    for (const assetPath of oldPaths) {
      if (!newPaths.has(assetPath)) {
        tauriCommands.deleteAsset(vaultPath, assetPath).catch(() => {
          /* already gone, ignore */
        });
      }
    }
  }
  return "saved";
}
