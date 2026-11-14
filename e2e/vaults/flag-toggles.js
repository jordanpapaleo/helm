import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "loose.md",
    {
      id: "e2e-loose",
      title: "Loose Note",
      state: "",
      tags: [],
      unmanaged: true,
      urgent: false,
      important: false,
      blocked: false,
    },
    "Unmanaged already.",
  );
}
