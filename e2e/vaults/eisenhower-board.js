import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "do-now.md",
    {
      id: "e2e-do",
      title: "Do Now",
      state: "Prepare",
      tags: ["one", "two", "three", "four"],
      urgent: true,
      important: true,
      blocked: true,
    },
    "Urgent.",
  );
  writeNote(
    vaultPath,
    "done.md",
    {
      id: "e2e-done",
      title: "Already Done",
      state: "Done",
      tags: [],
      urgent: true,
      important: true,
    },
    "Finished.",
  );
  writeNote(
    vaultPath,
    "loose.md",
    {
      id: "e2e-loose",
      title: "Loose Card",
      state: "Prepare",
      tags: [],
      unmanaged: true,
      urgent: true,
      important: true,
    },
    "Unmanaged.",
  );
}
