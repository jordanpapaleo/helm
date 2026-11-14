import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "anchor.md",
    { id: "e2e-anchor", title: "Anchor", state: "Prepare", tags: [] },
    "Keeps the watcher running.",
  );
}
