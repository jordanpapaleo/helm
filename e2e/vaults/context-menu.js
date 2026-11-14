import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "alpha.md",
    {
      id: "e2e-alpha",
      title: "Alpha",
      state: "Doing",
      tags: [],
      urgent: true,
      important: true,
      blocked: true,
    },
    "Body of alpha.",
  );
}
