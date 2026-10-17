import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteStore } from "../store/notes";
import { useToastStore } from "../store/toast";
import { useUIStore } from "../store/ui";
import type { Note, VaultConfig } from "../types/note";
import { createNote } from "./create-note";
import { parseNote } from "./note-parser";
import { tauriCommands } from "./tauri-commands";

vi.mock("./tauri-commands", () => ({
  tauriCommands: {
    writeNote: vi.fn().mockResolvedValue(undefined),
  },
}));

const VAULT: VaultConfig = { id: "v1", name: "Work", path: "/work" };

function templateNote(): Note {
  return {
    id: "01TEMPLATE000000000000000",
    filePath: "/other/bug.md",
    fileName: "bug.md",
    content: "Reproduce the failure.\n",
    vaultId: "v-other",
    frontmatter: {
      id: "01TEMPLATE000000000000000",
      title: "Bug report",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-02T00:00:00Z",
      tags: ["eng"],
      urgent: true,
      important: true,
      state: "Maintain",
      blocked: false,
      template: true,
      locked: true,
      pinned: true,
      links: ["STALE"],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useToastStore.setState({ toasts: [] });
  useNoteStore.setState({
    notes: [templateNote()],
    selectedNoteId: null,
    vaults: [VAULT],
    activeVaultId: "v1",
    tagTree: {},
    searchIndex: null,
    searchQuery: "",
    searchResults: [],
    knownFolderPaths: [],
  });
  useUIStore.setState({
    activeView: "kanban",
    selectedGrouping: { type: "all", id: null },
    newNoteMenuOpen: false,
    navHistory: [
      {
        view: "kanban",
        selectedNoteId: null,
        selectedGrouping: { type: "all", id: null },
      },
    ],
    navIndex: 0,
  });
});

describe("createNote", () => {
  it("writes a new note from a template into the destination folder and leaves the template untouched", async () => {
    const template = templateNote();
    const created = await createNote({
      folderPath: "/work/inbox",
      templateId: template.id,
      overrides: { state: "Doing" },
      recordNavigation: true,
    });

    expect(created).not.toBeNull();
    expect(tauriCommands.writeNote).toHaveBeenCalledTimes(1);
    const [filePath, raw] = vi.mocked(tauriCommands.writeNote).mock.calls[0] ?? [];
    expect(filePath).toBe(created?.filePath);
    expect(filePath).not.toBe(template.filePath);
    expect(filePath?.startsWith("/work/inbox/")).toBe(true);

    const parsed = parseNote(raw ?? "", filePath ?? "");
    expect(parsed.frontmatter.id).not.toBe(template.id);
    expect(parsed.frontmatter.title).toBe("Untitled");
    expect(parsed.frontmatter.state).toBe("Doing");
    expect(parsed.frontmatter.urgent).toBe(true);
    expect(parsed.frontmatter.important).toBe(true);
    expect(parsed.frontmatter.tags).toEqual(["eng"]);
    expect(parsed.frontmatter.template).toBeUndefined();
    expect(parsed.content.trim()).toBe("Reproduce the failure.");
    expect(raw).not.toContain("STALE");
    expect(raw).not.toMatch(/^locked:/m);
    expect(raw).not.toMatch(/^pinned:/m);
    expect(raw).not.toMatch(/^template:/m);
    expect(created?.frontmatter.locked).toBeUndefined();
    expect(created?.frontmatter.pinned).toBeUndefined();

    expect(useNoteStore.getState().notes.map((n) => n.id)).toEqual([template.id, created?.id]);
    expect(useNoteStore.getState().notes[0]).toEqual(template);
    expect(useNoteStore.getState().selectedNoteId).toBe(created?.id);
    expect(useUIStore.getState().activeView).toBe("notes");
    expect(useUIStore.getState().navHistory.at(-1)?.view).toBe("notes");
  });

  it("creates a blank note when the template id is missing", async () => {
    const created = await createNote({ templateId: "missing" });

    expect(created?.content).toBe("");
    expect(created?.frontmatter.title).toBe("Untitled");
    expect(created?.frontmatter.state).toBe("Prepare");
    expect(created?.filePath.startsWith("/work/")).toBe(true);
    expect(useNoteStore.getState().notes).toHaveLength(2);
  });

  it("reports a write failure and does not add the note", async () => {
    vi.mocked(tauriCommands.writeNote).mockRejectedValueOnce(new Error("disk full"));

    const created = await createNote({ templateId: null });

    expect(created).toBeNull();
    expect(useNoteStore.getState().notes).toHaveLength(1);
    expect(useToastStore.getState().toasts.some((t) => t.message.includes("disk full"))).toBe(true);
  });
});
