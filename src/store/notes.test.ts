import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { Note, VaultConfig } from "../types/note";
import { useNoteStore } from "./notes";

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "01JPMXYZ123",
    filePath: "/notes/test.md",
    fileName: "test.md",
    content: "Test content",
    vaultId: "vault-1",
    frontmatter: {
      id: "01JPMXYZ123",
      title: "Test Note",
      created: "2026-03-13",
      updated: "2026-03-13",
      tags: ["Code"],
      urgent: false,
      important: true,
      state: "Doing",
      blocked: false,
      links: [],
    },
    ...overrides,
  };
}

describe("useNoteStore", () => {
  beforeEach(() => {
    useNoteStore.setState({ notes: [], selectedNoteId: null, vaults: [], activeVaultId: null });
  });

  it("loads notes into the store", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([makeNote()]));
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0].id).toBe("01JPMXYZ123");
  });

  it("selects a note by id", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setNotes([makeNote()]);
      result.current.selectNote("01JPMXYZ123");
    });
    expect(result.current.selectedNoteId).toBe("01JPMXYZ123");
  });

  it("updates a note in place", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setNotes([makeNote()]);
      result.current.updateNote({ ...makeNote(), content: "Updated content" });
    });
    expect(result.current.notes[0].content).toBe("Updated content");
  });

  it("removes a note by id", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setNotes([makeNote()]);
      result.current.removeNote("01JPMXYZ123");
    });
    expect(result.current.notes).toHaveLength(0);
  });

  it("builds tag tree from notes", () => {
    const note1 = makeNote({
      id: "01",
      frontmatter: { ...makeNote().frontmatter, id: "01", tags: ["rl", "ce"] },
    });
    const note2 = makeNote({
      id: "02",
      frontmatter: { ...makeNote().frontmatter, id: "02", tags: ["rl"] },
    });
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setNotes([note1, note2]));
    const tree = result.current.tagTree;
    expect(tree.rl).toBeDefined();
    expect(tree.rl.notes).toHaveLength(2);
    expect(tree.ce).toBeDefined();
    expect(tree.ce.notes).toHaveLength(1);
  });
});

describe("vault CRUD", () => {
  beforeEach(() => {
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  it("setVaults replaces the vault list", () => {
    const { result } = renderHook(() => useNoteStore());
    const vaults: VaultConfig[] = [
      { id: "v1", name: "Vault One", path: "/v1" },
      { id: "v2", name: "Vault Two", path: "/v2" },
    ];
    act(() => result.current.setVaults(vaults));
    expect(result.current.vaults).toEqual(vaults);
  });

  it("addVaultConfig appends a vault", () => {
    const { result } = renderHook(() => useNoteStore());
    const v1: VaultConfig = { id: "v1", name: "Vault One", path: "/v1" };
    const v2: VaultConfig = { id: "v2", name: "Vault Two", path: "/v2" };
    act(() => {
      result.current.setVaults([v1]);
      result.current.addVaultConfig(v2);
    });
    expect(result.current.vaults).toHaveLength(2);
    expect(result.current.vaults[1]).toEqual(v2);
  });

  it("removeVaultConfig removes by id and leaves others", () => {
    const { result } = renderHook(() => useNoteStore());
    const v1: VaultConfig = { id: "v1", name: "Vault One", path: "/v1" };
    const v2: VaultConfig = { id: "v2", name: "Vault Two", path: "/v2" };
    act(() => {
      result.current.setVaults([v1, v2]);
      result.current.removeVaultConfig("v1");
    });
    expect(result.current.vaults).toHaveLength(1);
    expect(result.current.vaults[0].id).toBe("v2");
  });

  it("setActiveVaultId sets the active vault", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setActiveVaultId("v1"));
    expect(result.current.activeVaultId).toBe("v1");
  });

  it("setActiveVaultId with null clears the active vault", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setActiveVaultId("v1");
      result.current.setActiveVaultId(null);
    });
    expect(result.current.activeVaultId).toBeNull();
  });
});

describe("appendNotes", () => {
  beforeEach(() => {
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  function makeNote(overrides: Partial<Note> = {}): Note {
    return {
      id: "01JPMXYZ123",
      filePath: "/notes/test.md",
      fileName: "test.md",
      content: "Test content",
      vaultId: "vault-1",
      frontmatter: {
        id: "01JPMXYZ123",
        title: "Test Note",
        created: "2026-03-13",
        updated: "2026-03-13",
        tags: [],
        urgent: false,
        important: true,
        state: "Doing",
        blocked: false,
        links: [],
      },
      ...overrides,
    };
  }

  it("adds new notes to existing ones", () => {
    const { result } = renderHook(() => useNoteStore());
    const existing = makeNote({ id: "n1", filePath: "/notes/a.md", fileName: "a.md" });
    const incoming = makeNote({ id: "n2", filePath: "/notes/b.md", fileName: "b.md" });
    act(() => {
      result.current.setNotes([existing]);
      result.current.appendNotes([incoming]);
    });
    expect(result.current.notes).toHaveLength(2);
  });

  it("deduplicates by filePath: incoming replaces existing with same filePath", () => {
    const { result } = renderHook(() => useNoteStore());
    const original = makeNote({ id: "n1", filePath: "/notes/a.md", content: "original" });
    const updated = makeNote({ id: "n1", filePath: "/notes/a.md", content: "updated" });
    act(() => {
      result.current.setNotes([original]);
      result.current.appendNotes([updated]);
    });
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0].content).toBe("updated");
  });

  it("updates tagTree after append", () => {
    const { result } = renderHook(() => useNoteStore());
    const existing = makeNote({
      id: "n1",
      filePath: "/notes/a.md",
      frontmatter: { ...makeNote().frontmatter, id: "n1", tags: ["alpha"] },
    });
    const incoming = makeNote({
      id: "n2",
      filePath: "/notes/b.md",
      frontmatter: { ...makeNote().frontmatter, id: "n2", tags: ["beta"] },
    });
    act(() => {
      result.current.setNotes([existing]);
      result.current.appendNotes([incoming]);
    });
    expect(result.current.tagTree.alpha).toBeDefined();
    expect(result.current.tagTree.beta).toBeDefined();
  });
});

describe("addNote", () => {
  beforeEach(() => {
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  function makeNote(overrides: Partial<Note> = {}): Note {
    return {
      id: "01JPMXYZ123",
      filePath: "/notes/test.md",
      fileName: "test.md",
      content: "Test content",
      vaultId: "vault-1",
      frontmatter: {
        id: "01JPMXYZ123",
        title: "Test Note",
        created: "2026-03-13",
        updated: "2026-03-13",
        tags: [],
        urgent: false,
        important: true,
        state: "Doing",
        blocked: false,
        links: [],
      },
      ...overrides,
    };
  }

  it("adds a note not already present", () => {
    const { result } = renderHook(() => useNoteStore());
    const note = makeNote({ id: "n1", filePath: "/notes/new.md" });
    act(() => result.current.addNote(note));
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0].id).toBe("n1");
  });

  it("does not add duplicate if same filePath already in store", () => {
    const { result } = renderHook(() => useNoteStore());
    const note = makeNote({ id: "n1", filePath: "/notes/dup.md" });
    act(() => {
      result.current.addNote(note);
      result.current.addNote({ ...note, content: "different content" });
    });
    expect(result.current.notes).toHaveLength(1);
    expect(result.current.notes[0].content).toBe("Test content");
  });
});

describe("search", () => {
  beforeEach(() => {
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  function makeNote(overrides: Partial<Note> = {}): Note {
    return {
      id: "01JPMXYZ123",
      filePath: "/notes/test.md",
      fileName: "test.md",
      content: "Test content",
      vaultId: "vault-1",
      frontmatter: {
        id: "01JPMXYZ123",
        title: "Test Note",
        created: "2026-03-13",
        updated: "2026-03-13",
        tags: [],
        urgent: false,
        important: true,
        state: "Doing",
        blocked: false,
        links: [],
      },
      ...overrides,
    };
  }

  it("empty query sets searchResults to []", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setNotes([makeNote()]);
      result.current.search("");
    });
    expect(result.current.searchResults).toEqual([]);
    expect(result.current.searchQuery).toBe("");
  });

  it("whitespace-only query sets searchResults to []", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setNotes([makeNote()]);
      result.current.search("   ");
    });
    expect(result.current.searchResults).toEqual([]);
    expect(result.current.searchQuery).toBe("   ");
  });

  it("valid query returns matching notes", () => {
    const { result } = renderHook(() => useNoteStore());
    const note = makeNote({
      id: "n1",
      filePath: "/notes/alpha.md",
      content: "The quick brown fox",
      frontmatter: {
        id: "n1",
        title: "Alpha Note",
        created: "2026-03-13",
        updated: "2026-03-13",
        tags: [],
        urgent: false,
        important: false,
        state: "Doing",
        blocked: false,
        links: [],
      },
    });
    act(() => {
      result.current.setNotes([note]);
      result.current.search("Alpha");
    });
    expect(result.current.searchResults.length).toBeGreaterThan(0);
    expect(result.current.searchResults[0].id).toBe("n1");
  });

  it("updates searchQuery on every call", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.search("first"));
    expect(result.current.searchQuery).toBe("first");
    act(() => result.current.search("second"));
    expect(result.current.searchQuery).toBe("second");
  });
});

describe("setKnownFolderPaths", () => {
  beforeEach(() => {
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  it("sets knownFolderPaths to the provided array", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => result.current.setKnownFolderPaths(["/a", "/b", "/c"]));
    expect(result.current.knownFolderPaths).toEqual(["/a", "/b", "/c"]);
  });

  it("replaces previous value", () => {
    const { result } = renderHook(() => useNoteStore());
    act(() => {
      result.current.setKnownFolderPaths(["/old"]);
      result.current.setKnownFolderPaths(["/new1", "/new2"]);
    });
    expect(result.current.knownFolderPaths).toEqual(["/new1", "/new2"]);
  });
});

describe("nested tag tree", () => {
  beforeEach(() => {
    useNoteStore.setState({
      notes: [],
      selectedNoteId: null,
      vaults: [],
      activeVaultId: null,
      tagTree: {},
      searchIndex: null,
      searchQuery: "",
      searchResults: [],
      knownFolderPaths: [],
    });
  });

  function makeNote(overrides: Partial<Note> = {}): Note {
    return {
      id: "01JPMXYZ123",
      filePath: "/notes/test.md",
      fileName: "test.md",
      content: "Test content",
      vaultId: "vault-1",
      frontmatter: {
        id: "01JPMXYZ123",
        title: "Test Note",
        created: "2026-03-13",
        updated: "2026-03-13",
        tags: [],
        urgent: false,
        important: true,
        state: "Doing",
        blocked: false,
        links: [],
      },
      ...overrides,
    };
  }

  it("creates nested children for hierarchical tags like work/project", () => {
    const { result } = renderHook(() => useNoteStore());
    const note = makeNote({
      id: "n1",
      frontmatter: {
        ...makeNote().frontmatter,
        id: "n1",
        tags: ["work/project"],
      },
    });
    act(() => result.current.setNotes([note]));
    const tree = result.current.tagTree;
    expect(tree.work).toBeDefined();
    expect(tree.work.children.project).toBeDefined();
  });

  it("note appears in the leaf node of a nested tag", () => {
    const { result } = renderHook(() => useNoteStore());
    const note = makeNote({
      id: "n1",
      frontmatter: {
        ...makeNote().frontmatter,
        id: "n1",
        tags: ["work/project"],
      },
    });
    act(() => result.current.setNotes([note]));
    const leaf = result.current.tagTree.work.children.project;
    expect(leaf.notes).toHaveLength(1);
    expect(leaf.notes[0].id).toBe("n1");
  });
});
