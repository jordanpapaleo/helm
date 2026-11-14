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
    "beta.md",
    { id: "e2e-beta", title: "Beta", state: "Doing", tags: ["ship"] },
    "Body of beta.",
  );
}
