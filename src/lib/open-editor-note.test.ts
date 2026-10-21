import { expect, it } from "vitest";
import type { Note } from "../types/note";
import { openEditorNote } from "./open-editor-note";

const note = { id: "n", frontmatter: { title: "Compass" } } as Note;

it("opens the selected note only in the notes view, outside Trash", () => {
  expect(openEditorNote([note], "n", "notes", { type: "all", id: null })?.id).toBe("n");
  for (const view of ["dashboard", "kanban", "graph", "eisenhower"] as const) {
    expect(openEditorNote([note], "n", view, { type: "all", id: null })).toBeUndefined();
  }
  expect(openEditorNote([note], "n", "notes", { type: "trash", id: null })).toBeUndefined();
  expect(openEditorNote([note], null, "notes", { type: "all", id: null })).toBeUndefined();
  expect(openEditorNote([note], "missing", "notes", { type: "all", id: null })).toBeUndefined();
});
