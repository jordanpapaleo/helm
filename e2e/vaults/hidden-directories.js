import { writeNote, writeRaw } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "visible.md",
    { id: "e2e-visible", title: "Visible Note", state: "Prepare", tags: [] },
    "Shown.",
  );
  writeRaw(
    vaultPath,
    ".secret/hidden.md",
    "---\nid: e2e-hidden\ntitle: 'Hidden Secret'\ncreated: '2026-03-13T09:14:22Z'\nupdated: '2026-03-13T09:14:22Z'\n---\n\nNope.\n",
  );
  writeRaw(
    vaultPath,
    "assets/not-a-note.md",
    "---\nid: e2e-asset\ntitle: 'Asset Note'\ncreated: '2026-03-13T09:14:22Z'\nupdated: '2026-03-13T09:14:22Z'\n---\n\nNope.\n",
  );
}
