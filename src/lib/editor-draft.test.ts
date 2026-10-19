import { expect, it } from "vitest";
import {
  getEditorDraftRevision,
  notifyEditorDraft,
  readEditorDraft,
  registerEditorDraft,
  subscribeEditorDrafts,
} from "./editor-draft";

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

it("notifies subscribers when a registered draft changes and stops after unsubscribe", () => {
  let content = "original";
  const unregister = registerEditorDraft("note", () => content);
  const seen: string[] = [];
  const stop = subscribeEditorDrafts(() => {
    const draft = readEditorDraft("note");
    if (draft !== undefined) seen.push(draft);
  });
  const before = getEditorDraftRevision();
  content = "typed but not saved";
  notifyEditorDraft("note");
  const after = getEditorDraftRevision();
  expect(after).toBeGreaterThan(before);
  expect(seen).toEqual(["typed but not saved"]);
  stop();
  content = "after unsubscribe";
  notifyEditorDraft("note");
  expect(seen).toEqual(["typed but not saved"]);
  const unchanged = getEditorDraftRevision();
  notifyEditorDraft("missing");
  expect(getEditorDraftRevision()).toBe(unchanged);
  unregister();
});
