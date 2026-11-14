import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "alpha.md",
    { id: "e2ealpha", title: "Alpha", state: "Prepare", tags: [] },
    "Original body",
  );
}
