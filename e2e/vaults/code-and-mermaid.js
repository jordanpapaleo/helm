import { writeNote } from "../support/notes.js";

const body = [
  "```javascript",
  "const n = 1;",
  "```",
  "",
  "```mermaid",
  "graph TD",
  "  A-->B",
  "```",
].join("\n");

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "diagrams.md",
    { id: "e2e-diagrams", title: "Diagrams", state: "Prepare", tags: [] },
    body,
  );
}
