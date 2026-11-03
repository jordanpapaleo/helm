import { type EventCallback, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { ulid } from "ulid";
import { queueExistingNoteWrite } from "../lib/existing-note-write";
import { noteVaultMutated, startupVault } from "../lib/git-sync-runtime";
import { parseNote } from "../lib/note-parser";
import { projectFromMetaFile } from "../lib/projects";
import { tauriCommands } from "../lib/tauri-commands";
import { nowTimestamp } from "../lib/timestamps";
import { useNoteStore } from "../store/notes";
import { useProjectStore } from "../store/projects";
import type { Note, VaultConfig } from "../types/note";

/** Fill id, title, created, and updated. Returns null when the file already has them. */
function repairMissingFields(note: Note, now: string, preferredId: string): Note | null {
  const fm = { ...note.frontmatter };
  let dirty = false;
  if (!fm.id) {
    fm.id = preferredId;
    dirty = true;
  }
  if (!fm.title) {
    const base = note.filePath.split("/").pop()?.replace(/\.md$/i, "") ?? "Untitled";
    fm.title = base.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    dirty = true;
  }
  if (!fm.created) {
    fm.created = now;
    dirty = true;
  }
  if (!fm.updated) {
    fm.updated = now;
    dirty = true;
  }
  if (!dirty) return null;
  return { ...note, id: fm.id, frontmatter: fm };
}

/**
 * Repair missing required frontmatter fields in all notes in a vault.
 * Only writes files that actually need changes.
 */
async function repairVaultFrontmatter(vaultPath: string): Promise<void> {
  const now = nowTimestamp();
  const files = await tauriCommands.listNotes(vaultPath).catch(() => null);
  if (!files) return;

  for (const f of files) {
    const note = parseNote(f.content, f.path);
    let dirty = false;
    const fm = { ...note.frontmatter };

    if (!fm.id) {
      fm.id = ulid();
      dirty = true;
    }
    if (!fm.title) {
      const base = f.path.split("/").pop()?.replace(/\.md$/i, "") ?? "Untitled";
      fm.title = base.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      dirty = true;
    }
    if (!fm.created) {
      fm.created = now;
      dirty = true;
    }
    if (!fm.updated) {
      fm.updated = now;
      dirty = true;
    }

    if (dirty) {
      const patched: Note = { ...note, id: fm.id, frontmatter: fm };
      // Re-read so a write that landed after list_notes is the base. The
      // assigned id is reused when the file still has none.
      await queueExistingNoteWrite({
        noteId: fm.id,
        enqueuedPath: f.path,
        beforeUpdated: note.frontmatter.updated,
        fallback: patched,
        vaultPath,
        pathSource: "exact",
        preferDisk: true,
        updateStore: false,
        silent: true,
        failureMessage: "Failed to repair note",
        apply: (base) => repairMissingFields(base, now, fm.id),
      }).catch(() => {
        // Non-fatal — skip unwritable files
      });
    }
  }
}

/**
 * Fold a created or modified file into the store. A file at a new path whose
 * id is already loaded is an external rename only if the old file is gone;
 * if it is still on disk the new file is a duplicate copy (Finder duplicate,
 * sync conflict) and is added so the store can flag it.
 */
export async function applyChangedFile(note: Note): Promise<void> {
  const store = useNoteStore.getState();
  const loaded = [...store.notes, ...store.duplicateGroups.flatMap((group) => group.copies)];
  if (loaded.some((n) => n.filePath === note.filePath)) {
    store.updateNote(note);
    return;
  }
  const existingById = note.id ? store.notes.find((n) => n.id === note.id) : undefined;
  if (!existingById) {
    store.addNote(note);
    return;
  }
  const oldFileStillThere = await tauriCommands.readNote(existingById.filePath).then(
    () => true,
    () => false,
  );
  if (oldFileStillThere) {
    useNoteStore.getState().addNote(note);
  } else {
    useNoteStore.getState().updateNote({ ...note, vaultId: existingById.vaultId });
  }
}

/**
 * Load all notes from a single vault and add them to the store.
 */
async function loadVault(vault: VaultConfig): Promise<void> {
  const files = await tauriCommands.listNotes(vault.path);
  const notes: Note[] = files.map((f) => {
    const parsed = parseNote(f.content, f.path);
    // Ensure every note has a unique id — files without frontmatter id get a
    // temporary in-memory ULID so selectNote / DnD work correctly.
    const id = parsed.id || ulid();
    return {
      ...parsed,
      id,
      frontmatter: { ...parsed.frontmatter, id },
      vaultId: vault.id,
    };
  });
  useNoteStore.getState().appendNotes(notes);
  // Idempotent on the Rust side: one watcher per vault path, even across reloads.
  await tauriCommands.watchVault(vault.path);
}

/**
 * Refresh the known folder list across all vaults in the store.
 */
async function refreshFolders(vaults: VaultConfig[]): Promise<void> {
  const results = await Promise.all(
    vaults.map((v) => tauriCommands.listFolders(v.path).catch(() => [] as string[])),
  );
  const allPaths = results.flat();
  useNoteStore.getState().setKnownFolderPaths(allPaths);
}

/** Rediscover projects from helm-project.json. Missing or invalid files are skipped. */
async function refreshProjects(vaults: VaultConfig[]): Promise<void> {
  const results = await Promise.all(
    vaults.map(async (vault) => {
      const files = await tauriCommands.listProjectFiles(vault.path).catch(() => []);
      return files.flatMap((file) => {
        const project = projectFromMetaFile(file.path, file.content, vault.id, vault.path);
        return project ? [project] : [];
      });
    }),
  );
  useProjectStore.getState().setProjects(results.flat());
}

/**
 * Add a new vault: repair its frontmatter, persist config, load notes, start watcher.
 */
export async function addVault(path: string): Promise<void> {
  await repairVaultFrontmatter(path);

  const name = path.split("/").pop() ?? "vault";
  const vault: VaultConfig = { id: ulid(), name, path };
  const store = useNoteStore.getState();
  const updatedVaults = [...store.vaults, vault];

  store.addVaultConfig(vault);
  await tauriCommands.setVaults(updatedVaults);
  await loadVault(vault);
  await refreshProjects(updatedVaults);
}

/**
 * Remove a vault from the store and config. Files on disk are untouched.
 */
export async function removeVault(id: string): Promise<void> {
  const store = useNoteStore.getState();
  const removed = store.vaults.find((v) => v.id === id);
  const updatedVaults = store.vaults.filter((v) => v.id !== id);

  store.removeVaultConfig(id);
  const toRemove = [
    ...store.notes,
    ...store.duplicateGroups.flatMap((group) => group.copies),
  ].filter((n) => n.vaultId === id);
  for (const note of toRemove) {
    store.removeNoteAtPath(note.filePath);
  }
  if (store.activeVaultId === id) {
    store.setActiveVaultId(null);
  }
  useProjectStore
    .getState()
    .setProjects(useProjectStore.getState().projects.filter((project) => project.vaultId !== id));
  await tauriCommands.setVaults(updatedVaults);
  // After setVaults: Rust keeps the watcher if a remaining vault is the same
  // directory under another spelling or symlink.
  if (removed) {
    await tauriCommands.unwatchVault(removed.path);
  }
}

/**
 * Hook that initializes the vault system on app startup.
 * Handles migration from single-vault to multi-vault config.
 * Only call this once at the top level (App.tsx).
 */
export function useVault() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    // Promises, not resolved functions: cleanup can run before listen() resolves
    // (StrictMode double-mount), and the late unlisten must still be called.
    const subscriptions: Promise<UnlistenFn>[] = [];
    function subscribe<T>(event: string, handler: EventCallback<T>): void {
      subscriptions.push(listen<T>(event, handler));
    }

    async function init() {
      try {
        let vaults = await tauriCommands.getVaults();

        // Migration: single-vault → multi-vault
        if (vaults.length === 0) {
          const legacyPath = await tauriCommands.getVaultPath();
          if (legacyPath) {
            const name = legacyPath.split("/").pop() ?? "vault";
            const migrated: VaultConfig = { id: ulid(), name, path: legacyPath };
            vaults = [migrated];
            await tauriCommands.setVaults(vaults);
          }
        }

        useNoteStore.getState().setVaults(vaults);
        if (vaults.length > 0) {
          // Pull connected vaults before they can be edited. A failure opens
          // the local files; startupVault records the status.
          for (const vault of vaults) {
            await startupVault(vault);
          }
          await Promise.all(vaults.map(loadVault));
          await refreshFolders(vaults);
          await refreshProjects(vaults);
        }
        if (disposed) return;

        // Listen for file creates/modifications
        subscribe<string[]>("vault-changed", async (event) => {
          const changedPaths = event.payload;
          const store = useNoteStore.getState();

          for (const filePath of changedPaths) {
            const vault = store.vaults.find((v) => filePath.startsWith(v.path));
            try {
              const content = await tauriCommands.readNote(filePath);
              let note: Note = {
                ...parseNote(content, filePath),
                vaultId: vault?.id ?? "",
              };

              // Repair missing id — can happen when an external tool creates a
              // file without frontmatter. Assign a ULID and write it back so the
              // note has a stable identity from this point forward.
              if (!note.id) {
                const newId = ulid();
                const assigned: Note = {
                  ...note,
                  id: newId,
                  frontmatter: { ...note.frontmatter, id: newId },
                };
                const result = await queueExistingNoteWrite({
                  noteId: newId,
                  enqueuedPath: filePath,
                  beforeUpdated: note.frontmatter.updated,
                  fallback: assigned,
                  vaultPath: vault?.path ?? null,
                  pathSource: "exact",
                  preferDisk: true,
                  updateStore: false,
                  silent: true,
                  failureMessage: "Failed to repair note",
                  apply: (base) =>
                    base.id
                      ? null
                      : { ...base, id: newId, frontmatter: { ...base.frontmatter, id: newId } },
                }).catch(() => null);
                note = result?.ok ? { ...result.note, vaultId: vault?.id ?? "" } : assigned;
              }

              await applyChangedFile(note);
            } catch {
              // Transient read error (race with write) — ignore
            }
          }
        });

        // Working-tree edits, including assets and MCP writes. Git metadata is
        // filtered out on the Rust side so a checkpoint cannot sync itself.
        subscribe<string>("vault-mutated", (event) => {
          noteVaultMutated(event.payload);
          const { vaults: currentVaults } = useNoteStore.getState();
          void refreshProjects(currentVaults);
        });

        // Listen for directory create/remove events — refresh the folder list
        subscribe<string>("vault-dirs-changed", () => {
          const { vaults: currentVaults } = useNoteStore.getState();
          void refreshFolders(currentVaults);
          void refreshProjects(currentVaults);
        });

        // Listen for confirmed file deletions
        subscribe<string[]>("vault-note-deleted", (event) => {
          for (const filePath of event.payload) {
            useNoteStore.getState().removeNoteAtPath(filePath);
          }
        });
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }

    init();

    return () => {
      disposed = true;
      for (const subscription of subscriptions) {
        subscription.then((unlisten) => unlisten()).catch(() => {});
      }
    };
  }, []);

  return { loading, error };
}
