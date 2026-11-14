import { writeNote } from "../support/notes.js";

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
    { id: "e2e-beta", title: "Beta", state: "Prepare", tags: [] },
    "Target.",
  );
  writeNote(
    vaultPath,
    "solo.md",
    { id: "e2e-solo", title: "Solo", state: "Prepare", tags: [] },
    "Alone.",
  );
}
