import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "bug-report.md",
    {
      id: "e2e-template",
      title: "Bug Report",
      state: "Doing",
      tags: ["bugs"],
      template: true,
      urgent: true,
      important: true,
      pinned: true,
    },
    "Steps to reproduce.",
  );
}
