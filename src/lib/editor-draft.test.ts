import { expect, it } from "vitest";
import { readEditorDraft, registerEditorDraft } from "./editor-draft";

it("reads the latest unsaved draft and old cleanup cannot unregister a replacement editor", () => {
  let content = "original";
  const old = registerEditorDraft("note", () => content);
  content = "unsaved";
  expect(readEditorDraft("note")).toBe("unsaved");
  const current = registerEditorDraft("note", () => "Markdown draft");
  old();
  expect(readEditorDraft("note")).toBe("Markdown draft");
  current();
  expect(readEditorDraft("note")).toBeUndefined();
});
