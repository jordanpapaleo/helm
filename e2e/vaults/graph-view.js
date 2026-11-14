import { writeNote, writeRaw } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "alpha.md",
    { id: "e2e-alpha", title: "Alpha", state: "Prepare", tags: [], links: ["e2e-beta"] },
    "See [[Beta]].",
  );
  writeNote(
    vaultPath,
    "beta.md",
    { id: "e2e-beta", title: "Beta", state: "Doing", tags: [] },
    "Target.",
  );
  writeRaw(
    vaultPath,
    ".secret/hidden.md",
    "---\nid: e2e-hidden\ntitle: 'Hidden Secret'\ncreated: '2026-03-13T09:14:22Z'\nupdated: '2026-03-13T09:14:22Z'\n---\n\nNope.\n",
  );
}
