import assert from "node:assert/strict";
import { $, browser } from "@wdio/globals";
import { readNoteFile, waitForNoteFile } from "../support/files.js";
import { armNativeAccept } from "../support/native.js";
import { prepareWindow, rightClick, showAllNotes } from "../support/ui.js";

describe("tags", () => {
  before(async () => {
    await prepareWindow();
    await showAllNotes();
  });

  it("renames a tag through its descendants and deletes it after confirmation", async () => {
    await rightClick(await $("span=work"));
    await $('[role="menuitem"]=Rename Tag').click();
    await browser.keys("chores");
    await browser.keys("Enter");
    const renamed = await waitForNoteFile(
      "plan.md",
      (note) =>
        Array.isArray(note.data.tags) &&
        note.data.tags.includes("chores/plan") &&
        note.content.includes("#chores/plan") &&
        note.content.includes("#workflow"),
      "the tag rename did not rewrite the note",
    );
    assert.equal(renamed.data.tags.includes("work/plan"), false);

    await rightClick(await $("span=chores"));
    const accepted = armNativeAccept("Delete Tag");
    await $('[role="menuitem"]=Delete Tag').click();
    await accepted;
    const deleted = await waitForNoteFile(
      "plan.md",
      (note) => !note.content.includes("#chores") && note.content.includes("#workflow"),
      "delete tag left the renamed tag in the body",
    );
    assert.equal(
      Array.isArray(deleted.data.tags) &&
        deleted.data.tags.some((tag) => String(tag).startsWith("chores")),
      false,
    );
    assert.match(readNoteFile("plan.md").content, /#workflow/);
  });
});
