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
  immediateNoteWritePath,
  resolveNoteWritePath,
  takeScheduledPath,
} from "./note-write-path";
import { mergeTagsOnSave } from "./tags";
import { tauriCommands } from "./tauri-commands";
import { nowTimestamp } from "./timestamps";

export type SaveNoteResult = "unchanged" | "blocked" | "saved";

const reportedSyncHolds = new Set<string>();

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

// Extract absolute file paths from asset:// URLs embedded in markdown image tags.
// http://asset.localhost/Users/foo/notes/assets/img.png → /Users/foo/notes/assets/img.png
function extractAssetPaths(content: string): Set<string> {
  const paths = new Set<string>();
  for (const match of content.matchAll(/!\[.*?\]\(([^)]+)\)/g)) {
    const src = match[1];
    try {
      const url = new URL(src);
      if (url.hostname === "asset.localhost") {
        paths.add(decodeURIComponent(url.pathname));
      }
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
  if (normalizeContent(content) === normalizeContent(note.content)) return "unchanged";

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
  useNoteStore.getState().updateNote(updated);
  try {
    await tauriCommands.writeNote(path, serializeNote(updated));
  } catch (e) {
    reportError("Failed to save note", e);
  }

  // Delete any asset files removed from this note since the last save
  const oldPaths = extractAssetPaths(latest.content);
  const newPaths = extractAssetPaths(content);
  for (const assetPath of oldPaths) {
    if (!newPaths.has(assetPath)) {
      tauriCommands.deleteAsset(assetPath).catch(() => {
        /* already gone, ignore */
      });
    }
  }
  return "saved";
}
