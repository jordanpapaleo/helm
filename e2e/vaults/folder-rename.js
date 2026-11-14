import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  mkdirSync(join(vaultPath, "recipes"), { recursive: true });
  writeNote(
    vaultPath,
    "recipes/soup.md",
    { id: "e2e-soup", title: "Soup", state: "Prepare", tags: [] },
    "Simmer.",
  );
}
