/**
 * Single write path for creating a note, blank or from a template.
 * Every New Note entry point goes through here so destination, context, and
 * template instantiation stay consistent.
 */
import { ulid } from "ulid";
import { useNoteStore } from "../store/notes";
import { useProjectStore } from "../store/projects";
import { reportError } from "../store/toast";
import type { Grouping } from "../store/ui";
import { useUIStore } from "../store/ui";
import type { Note } from "../types/note";
import { serializeNote } from "./note-parser";
import { creationDefaultsForFolder } from "./projects";
import { tauriCommands } from "./tauri-commands";
import { instantiateNote, type NoteDraftOverrides } from "./templates";
import { nowTimestamp } from "./timestamps";

export interface CreateNoteOptions {
  /** Destination folder. Defaults to the active vault root. */
  folderPath?: string;
  /** Destination vault. Defaults to the active vault, else the first vault. */
  vaultId?: string;
  /** Template note id. Null or unknown creates a blank note. */
  templateId?: string | null;
  overrides?: NoteDraftOverrides;
  /**
   * Record a navigation entry so Back returns to the previous view.
   * Boards use this. The note list only switches the view.
   */
  recordNavigation?: boolean;
}

/** Tag-scoped creation adds that tag to the new note without replacing template tags. */
export function overridesForGrouping(grouping: Grouping): NoteDraftOverrides | undefined {
  if (grouping.type === "tag" && grouping.id) {
    return { addTags: [grouping.id], appendInlineTag: grouping.id };
  }
  return undefined;
}

/**
 * Folder and tag context of the note list / File ▸ New Note action.
 * Boards should not use this — they pass their own column or quadrant.
 */
export function creationTargetFromUI(): Pick<
  CreateNoteOptions,
  "folderPath" | "vaultId" | "overrides"
> {
  const { vaults, activeVaultId } = useNoteStore.getState();
  const { selectedGrouping } = useUIStore.getState();
  const vault = vaults.find((v) => v.id === activeVaultId) ?? vaults[0];
  const folderPath = vault
    ? selectedGrouping.type === "folder" && selectedGrouping.id
      ? selectedGrouping.id
      : vault.path
    : undefined;
  return {
    vaultId: vault?.id,
    folderPath,
    overrides: overridesForGrouping(selectedGrouping),
  };
}

/**
 * Create a note in the destination vault and select it.
 * A template is only read — its file is not written.
 * @returns The new note, or null when there is no vault or the write fails.
 */
export async function createNote(options: CreateNoteOptions = {}): Promise<Note | null> {
  const { vaults, activeVaultId, notes, addNote, selectNote } = useNoteStore.getState();
  const vault = vaults.find((v) => v.id === (options.vaultId ?? activeVaultId)) ?? vaults[0];
  if (!vault) return null;

  const folderPath = options.folderPath ?? vault.path;
  const template = options.templateId
    ? (notes.find((n) => n.id === options.templateId && n.frontmatter.template === true) ?? null)
    : null;

  const id = ulid();
  const folderDefaults = creationDefaultsForFolder(folderPath, useProjectStore.getState().projects);
  const overrides: NoteDraftOverrides | undefined =
    folderDefaults || options.overrides ? { ...folderDefaults, ...options.overrides } : undefined;
  const note = instantiateNote({
    template,
    notes,
    id,
    now: nowTimestamp(),
    vaultId: vault.id,
    folderPath,
    overrides,
  });

  try {
    await tauriCommands.writeNote(note.filePath, serializeNote(note));
    addNote(note);
    if (options.recordNavigation) {
      const { navigate, selectedGrouping } = useUIStore.getState();
      navigate({ view: "notes", selectedNoteId: id, selectedGrouping });
    } else {
      selectNote(id);
      useUIStore.getState().setView("notes");
    }
    return note;
  } catch (e) {
    reportError("Failed to create note", e);
    return null;
  }
}
