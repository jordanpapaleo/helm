import { writeNote } from "../support/notes.js";

/** Alpha links to Beta. The side panel and the main editor are different notes after the click. */
export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "alpha.md",
    { id: "e2e-alpha", title: "Alpha", state: "Prepare", tags: [] },
    "See [[Beta]] for the rest.\n\nMore text",
  );
  writeNote(
    vaultPath,
    "beta.md",
    { id: "e2e-beta", title: "Beta", state: "Prepare", tags: [] },
    "Target body.",
  );
}
