import { writeNote } from "../support/notes.js";

export function seed(vaultPath) {
  writeNote(
    vaultPath,
    "plan.md",
    { id: "e2e-plan", title: "Plan", state: "Prepare", tags: ["work/plan"] },
    "See #work/plan beside #workflow.",
  );
}
