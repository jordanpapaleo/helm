import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "alpha.md",
    { id: "e2e-alpha", title: "Alpha", state: "Prepare", tags: [] },
    "See [[Beta]].",
  );
  writeNote(
    vaultPath,
    "beta.md",
    { id: "e2e-beta", title: "Beta", state: "Prepare", tags: [], archived: true },
    "Archived target.",
  );
  writeNote(
    vaultPath,
    "solo.md",
    { id: "e2e-solo", title: "Solo", state: "Prepare", tags: [] },
    "No links here.",
  );
  writeNote(
    vaultPath,
    "mention.md",
    { id: "e2e-mention", title: "Mention", state: "Prepare", tags: [] },
    "Points at [[Alpha]].",
  );
  writeNote(
    vaultPath,
    "locked.md",
    { id: "e2e-locked", title: "Locked Mention", state: "Prepare", tags: [], locked: true },
    "Also points at [[Alpha]].",
  );
}
