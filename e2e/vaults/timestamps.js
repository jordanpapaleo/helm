import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "dated.md",
    {
      id: "e2e-dated",
      title: "Dated Note",
      state: "Prepare",
      tags: [],
      deadline: "2026-04-02",
    },
    "Has a deadline.",
  );
}
