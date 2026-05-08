import { describe, expect, it } from "vitest";
import { buildTree, getAllFolderPaths } from "../lib/file-tree";
import type { Note } from "../types/note";

function makeNote(id: string, title: string, filePath: string): Note {
  return {
    id,
    frontmatter: {
      id,
      title,
      created: "2026-01-01",
      updated: "2026-01-01",
      tags: [],
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
      locked: false,
      pinned: false,
      links: [],
    },
    content: "",
    filePath,
    fileName: filePath.split("/").at(-1) ?? "",
    vaultId: "v1",
  };
}

const vault = "/vault";

describe("buildTree", () => {
  it("returns empty array for no notes", () => {
    expect(buildTree([], vault)).toEqual([]);
  });

  it("places root-level notes at the top level as note nodes", () => {
    const note = makeNote("1", "Alpha", "/vault/alpha.md");
    const tree = buildTree([note], vault);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toEqual({ kind: "note", note });
  });

  it("creates a folder node for a note one level deep", () => {
    const note = makeNote("1", "Alpha", "/vault/work/alpha.md");
    const tree = buildTree([note], vault);
    expect(tree).toHaveLength(1);
    expect(tree[0].kind).toBe("folder");
    if (tree[0].kind === "folder") {
      expect(tree[0].name).toBe("work");
      expect(tree[0].path).toBe("/vault/work");
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0]).toEqual({ kind: "note", note });
    }
  });

  it("groups multiple notes under the same folder", () => {
    const notes = [
      makeNote("1", "Alpha", "/vault/work/alpha.md"),
      makeNote("2", "Beta", "/vault/work/beta.md"),
    ];
    const tree = buildTree(notes, vault);
    expect(tree).toHaveLength(1);
    if (tree[0].kind === "folder") {
      expect(tree[0].children).toHaveLength(2);
    }
  });

  it("handles deeply nested notes", () => {
    const note = makeNote("1", "Deep", "/vault/a/b/deep.md");
    const tree = buildTree([note], vault);
    expect(tree[0].kind).toBe("folder");
    if (tree[0].kind === "folder") {
      expect(tree[0].name).toBe("a");
      const child = tree[0].children[0];
      expect(child.kind).toBe("folder");
      if (child.kind === "folder") {
        expect(child.name).toBe("b");
        expect(child.children[0]).toEqual({ kind: "note", note });
      }
    }
  });

  it("sorts folders before notes at each level", () => {
    const notes = [
      makeNote("1", "Root Note", "/vault/root.md"),
      makeNote("2", "Nested", "/vault/work/nested.md"),
    ];
    const tree = buildTree(notes, vault);
    expect(tree[0].kind).toBe("folder");
    expect(tree[1].kind).toBe("note");
  });

  it("sorts notes alphabetically by title within a folder", () => {
    const notes = [
      makeNote("1", "Zebra", "/vault/zebra.md"),
      makeNote("2", "Alpha", "/vault/alpha.md"),
    ];
    const tree = buildTree(notes, vault);
    expect(tree[0].kind).toBe("note");
    if (tree[0].kind === "note") {
      expect(tree[0].note.frontmatter.title).toBe("Alpha");
    }
  });
});

describe("buildTree - pinned notes and extra folders", () => {
  function makePinnedNote(id: string, title: string, filePath: string): Note {
    return {
      ...makeNote(id, title, filePath),
      frontmatter: {
        ...makeNote(id, title, filePath).frontmatter,
        pinned: true,
      },
    };
  }

  it("pinned note sorts before unpinned note in the same folder", () => {
    // "Zebra" is pinned, "Alpha" is unpinned — pinned should win regardless of title order
    const pinnedNote = makePinnedNote("1", "Zebra", "/vault/zebra.md");
    const unpinnedNote = makeNote("2", "Alpha", "/vault/alpha.md");
    const tree = buildTree([pinnedNote, unpinnedNote], vault);
    // Both are root-level note nodes
    expect(tree[0].kind).toBe("note");
    if (tree[0].kind === "note") {
      expect(tree[0].note.frontmatter.title).toBe("Zebra");
    }
    expect(tree[1].kind).toBe("note");
    if (tree[1].kind === "note") {
      expect(tree[1].note.frontmatter.title).toBe("Alpha");
    }
  });

  it("multiple pinned notes sort alphabetically among themselves", () => {
    const pinnedZebra = makePinnedNote("1", "Zebra", "/vault/zebra.md");
    const pinnedAlpha = makePinnedNote("2", "Alpha", "/vault/alpha.md");
    const tree = buildTree([pinnedZebra, pinnedAlpha], vault);
    expect(tree[0].kind).toBe("note");
    if (tree[0].kind === "note") {
      expect(tree[0].note.frontmatter.title).toBe("Alpha");
    }
    expect(tree[1].kind).toBe("note");
    if (tree[1].kind === "note") {
      expect(tree[1].note.frontmatter.title).toBe("Zebra");
    }
  });

  it("extraFolderPaths creates an empty folder node in the tree", () => {
    const note = makeNote("1", "Root Note", "/vault/root.md");
    const tree = buildTree([note], vault, ["/vault/archive"]);
    const folderNode = tree.find((n) => n.kind === "folder");
    expect(folderNode).toBeDefined();
    if (folderNode?.kind === "folder") {
      expect(folderNode.name).toBe("archive");
      expect(folderNode.path).toBe("/vault/archive");
      expect(folderNode.children).toHaveLength(0);
    }
  });

  it("extraFolderPaths ignores the vault root itself", () => {
    const note = makeNote("1", "Root Note", "/vault/root.md");
    const tree = buildTree([note], vault, ["/vault"]);
    // Should only contain the one root-level note, no spurious folder node for vault
    const folderNodes = tree.filter((n) => n.kind === "folder");
    expect(folderNodes).toHaveLength(0);
  });
});

describe("getAllFolderPaths", () => {
  it("returns root as the only entry when there are no folders", () => {
    const note = makeNote("1", "Root", "/vault/root.md");
    const tree = buildTree([note], vault);
    const folders = getAllFolderPaths(tree, vault);
    expect(folders).toEqual([{ label: "/ (root)", path: vault }]);
  });

  it("returns root plus all nested folder paths", () => {
    const notes = [
      makeNote("1", "A", "/vault/work/a.md"),
      makeNote("2", "B", "/vault/personal/b.md"),
    ];
    const tree = buildTree(notes, vault);
    const folders = getAllFolderPaths(tree, vault);
    expect(folders).toHaveLength(3);
    expect(folders[0]).toEqual({ label: "/ (root)", path: vault });
    const paths = folders.map((f) => f.path);
    expect(paths).toContain("/vault/work");
    expect(paths).toContain("/vault/personal");
  });
});
