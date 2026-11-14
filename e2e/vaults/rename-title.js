import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "alpha.md",
    { id: "e2e-alpha", title: "Alpha", state: "Prepare", tags: [] },
    "Body of alpha.",
  );
  writeNote(
    vaultPath,
    "taken.md",
    { id: "e2e-taken", title: "Taken", state: "Prepare", tags: [] },
    "Already here.",
  );
}
