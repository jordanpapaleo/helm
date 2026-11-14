import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "older-pin.md",
    {
      id: "e2e-pin",
      title: "Pinned Older",
      state: "Prepare",
      tags: ["kitchen"],
      pinned: true,
      updated: "2026-01-01T09:14:22Z",
    },
    "Pinned body.",
  );
  writeNote(
    vaultPath,
    "newer.md",
    {
      id: "e2e-newer",
      title: "Newer Plain",
      state: "Doing",
      tags: [],
      updated: "2026-06-01T09:14:22Z",
    },
    "Plain body mentions saffron.",
  );
}
