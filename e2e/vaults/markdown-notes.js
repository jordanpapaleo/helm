import { writeNote, writeRaw } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "titled.md",
    { id: "e2e-titled", title: "Titled Note", state: "Prepare", tags: [] },
    "Hello titled.",
  );
  writeRaw(
    vaultPath,
    "heading-only.md",
    "---\nid: e2e-heading\ncreated: '2026-03-13T09:14:22Z'\nupdated: '2026-03-13T09:14:22Z'\nstate: Prepare\ntags: []\n---\n\n# Heading From Body\n\nMore.\n",
  );
  writeRaw(
    vaultPath,
    "recipe-notes.md",
    "---\nid: e2e-filename\ncreated: '2026-03-13T09:14:22Z'\nupdated: '2026-03-13T09:14:22Z'\nstate: Prepare\ntags: []\n---\n\nJust a filename.\n",
  );
}
