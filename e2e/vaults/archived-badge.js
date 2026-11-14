import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "old.md",
    { id: "e2e-old", title: "Old Note", state: "Prepare", tags: [], archived: true },
    "Stored away.",
  );
}
