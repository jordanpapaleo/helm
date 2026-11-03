import { useGitSyncStore } from "../store/git-sync";
import { useNoteStore } from "../store/notes";
import { reportError } from "../store/toast";
import type { Note } from "../types/note";
import { commitExistingNote } from "./existing-note-write";
import { extractInlineTags, extractWikiLinks, normalizeContent } from "./note-parser";
import { enqueueNoteWrite, takeScheduledPath } from "./note-write-path";
import { mergeTagsOnSave } from "./tags";
import { tauriCommands } from "./tauri-commands";
import { nowTimestamp } from "./timestamps";

export type SaveNoteResult = "unchanged" | "blocked" | "saved";

const reportedSyncHolds = new Set<string>();
/** Editor text we already refused because a newer body was on disk. */
const keptDiskBodies = new Map<string, string>();

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
  // Adopting the disk note updates the store. A second save of this same
  // draft must not write it back over the body we just kept.
  if (keptDiskBodies.get(note.id) === normalizeContent(content)) return "blocked";

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

  // Tags are merged, never recomputed. Reading a note unions the frontmatter
  // list with the body's inline tags, so recomputing from the body alone
  // would delete every tag set from the property panel and never typed as
  // `#tag`. Comparing the pre-save body with the incoming one tells us which
  // tags the user actually removed. See mergeTagsOnSave.
  const result = await commitExistingNote({
    noteId: latest.id,
    enqueuedPath,
    beforeUpdated: latest.frontmatter.updated,
    vaultPath,
    refuseIfBodyDiffers: content,
    mirrorBeforeWrite: true,
    onDiskKept: () => {
      keptDiskBodies.set(latest.id, normalizeContent(content));
    },
    failureMessage: "Failed to save note",
    apply: (base) => {
      const notes = useNoteStore.getState().notes;
      const mergedTags = mergeTagsOnSave(
        base.frontmatter.tags,
        extractInlineTags(base.content),
        extractInlineTags(content),
      );
      const wikiTitles = extractWikiLinks(content);
      const linkedIds = wikiTitles
        .map(
          (title) =>
            notes.find((item) => item.frontmatter.title.toLowerCase() === title.toLowerCase())?.id,
        )
        .filter((id): id is string => id !== undefined && id !== latest.id);
      return {
        ...base,
        content,
        frontmatter: {
          ...base.frontmatter,
          tags: mergedTags,
          links: linkedIds.length > 0 ? linkedIds : undefined,
          updated: nowTimestamp(),
        },
      };
    },
  });
  if (!result.ok && (result.reason === "missing" || result.reason === "newer-body")) {
    return "blocked";
  }
  keptDiskBodies.delete(latest.id);

  // Delete any asset files removed from this note since the last save.
  // A refused write left the file alone, so its images stay too.
  if (result.ok && result.wrote) {
    const oldPaths = extractAssetPaths(latest.content);
    const newPaths = extractAssetPaths(content);
    for (const assetPath of oldPaths) {
      if (!newPaths.has(assetPath)) {
        tauriCommands.deleteAsset(assetPath).catch(() => {
          /* already gone, ignore */
        });
      }
    }
  }
  return "saved";
}
