import { writeNote } from "../support/notes.js";

/** A normal note: workflow flags are set, and `unmanaged` is not in the file. */
export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "managed-note.md",
    {
      id: "e2e-managed",
      title: "Managed Note",
      state: "Doing",
      urgent: true,
      important: true,
      blocked: true,
      tags: [],
    },
    "Body of the managed note.",
  );
}
