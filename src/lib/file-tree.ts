import type { Note } from "../types/note";

export type TreeNode =
  | { kind: "folder"; name: string; path: string; children: TreeNode[] }
  | { kind: "note"; note: Note };

/**
 * Build a folder-based tree from a flat array of notes.
 * Folders sort before notes; notes sort alphabetically by title.
 * Pass extraFolderPaths to make empty folders (with no notes) visible.
 */
export function buildTree(
  notes: Note[],
  vaultPath: string,
  extraFolderPaths: string[] = [],
): TreeNode[] {
  const vault = vaultPath.replace(/\/+$/, "");

  // Map folderPath -> notes directly inside that folder
  // Also registers all intermediate folder paths (even if empty) so subfolder
  // detection works correctly for deeply nested notes.
  const byFolder = new Map<string, Note[]>();

  // Seed with known folder paths so empty folders are visible in the tree
  for (const fp of extraFolderPaths) {
    const normalized = fp.replace(/\/+$/, "");
    if (normalized === vault) continue;
    // Register the folder itself and all its ancestors
    if (normalized.startsWith(`${vault}/`)) {
      const rel = normalized.slice(vault.length + 1);
      const parts = rel.split("/");
      for (let i = 1; i <= parts.length; i++) {
        const ancestor = `${vault}/${parts.slice(0, i).join("/")}`;
        if (!byFolder.has(ancestor)) byFolder.set(ancestor, []);
      }
    }
  }

  for (const note of notes) {
    const rel = note.filePath.startsWith(`${vault}/`)
      ? note.filePath.slice(vault.length + 1)
      : note.filePath;
    const parts = rel.split("/");

    // Register all ancestor folders (excluding the file itself)
    for (let i = 1; i < parts.length; i++) {
      const ancestorPath = `${vault}/${parts.slice(0, i).join("/")}`;
      if (!byFolder.has(ancestorPath)) {
        byFolder.set(ancestorPath, []);
      }
    }

    const parentRel = parts.length === 1 ? "" : parts.slice(0, -1).join("/");
    const parentPath = parentRel === "" ? vault : `${vault}/${parentRel}`;
    const bucket = byFolder.get(parentPath) ?? [];
    bucket.push(note);
    byFolder.set(parentPath, bucket);
  }

  function buildChildren(folderPath: string): TreeNode[] {
    const directNotes = byFolder.get(folderPath) ?? [];
    const noteNodes: TreeNode[] = [...directNotes]
      .sort((a, b) => {
        // Pinned notes float to the top; within each group sort alphabetically
        const pinA = a.frontmatter.pinned ? 0 : 1;
        const pinB = b.frontmatter.pinned ? 0 : 1;
        if (pinA !== pinB) return pinA - pinB;
        return a.frontmatter.title.localeCompare(b.frontmatter.title);
      })
      .map((note) => ({ kind: "note" as const, note }));

    // Find direct subfolders: keys in byFolder that are exactly one segment deeper
    const subfolders = new Set<string>();
    for (const key of byFolder.keys()) {
      if (key !== folderPath && key.startsWith(`${folderPath}/`)) {
        const rel = key.slice(folderPath.length + 1);
        if (!rel.includes("/")) subfolders.add(key);
      }
    }

    const folderNodes: TreeNode[] = [...subfolders]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((fp) => ({
        kind: "folder" as const,
        name: fp.split("/").at(-1) ?? "",
        path: fp,
        children: buildChildren(fp),
      }));

    return [...folderNodes, ...noteNodes];
  }

  return buildChildren(vault);
}

/**
 * Collect all folder paths from the tree for the "Move to…" submenu.
 * Always includes vault root as the first entry.
 */
export function getAllFolderPaths(
  tree: TreeNode[],
  vaultPath: string,
): Array<{ label: string; path: string }> {
  const vault = vaultPath.replace(/\/+$/, "");
  const result: Array<{ label: string; path: string }> = [{ label: "/ (root)", path: vault }];

  function collect(nodes: TreeNode[]) {
    for (const node of nodes) {
      if (node.kind === "folder") {
        result.push({
          label: node.path.slice(vault.length + 1),
          path: node.path,
        });
        collect(node.children);
      }
    }
  }

  collect(tree);
  return result;
}
