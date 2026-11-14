import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "doing.md",
    { id: "e2e-doing", title: "Doing Card", state: "Doing", tags: ["ship"] },
    "In progress.",
  );
  writeNote(
    vaultPath,
    "loose.md",
    { id: "e2e-loose", title: "Loose Card", state: "Doing", tags: [], unmanaged: true },
    "Not on the board.",
  );
}
