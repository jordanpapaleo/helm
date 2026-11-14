import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "recipes.md",
    { id: "e2e-recipes", title: "Recipe Note", state: "Prepare", tags: ["recipes"] },
    "Cook the #recipes tonight.",
  );
}
