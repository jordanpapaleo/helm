import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "ship.md",
    {
      id: "e2e-ship",
      title: "Ship It",
      state: "Doing",
      tags: ["release"],
      urgent: true,
      important: true,
      team: "Platform",
      deadline: "2020-01-01",
    },
    "Overdue work.",
  );
  writeNote(
    vaultPath,
    "loose.md",
    {
      id: "e2e-loose",
      title: "Loose Note",
      state: "",
      tags: [],
      unmanaged: true,
      deadline: "2020-01-01",
    },
    "Not in the briefing.",
  );
  writeNote(
    vaultPath,
    "finished.md",
    {
      id: "e2e-finished",
      title: "Finished Note",
      state: "Done",
      tags: [],
      deadline: "2020-01-01",
    },
    "Done notes leave the briefing.",
  );
}
