import assert from "node:assert/strict";
import { $ } from "@wdio/globals";
import { waitForNoteFile } from "../support/files.js";
import { prepareWindow, rightClick, showAllNotes } from "../support/ui.js";

describe("note list context menu", () => {
  before(async () => {
    await prepareWindow();
    await showAllNotes();
  });

  it("marks a note unmanaged and clears its workflow fields", async () => {
    await rightClick(await $('button[aria-haspopup="menu"]*=Alpha'));
    await $('[role="menuitem"]=Mark Unmanaged').click();
    const saved = await waitForNoteFile(
      "alpha.md",
      (note) => note.data.unmanaged === true,
      "Mark Unmanaged did not write",
    );
    assert.equal(saved.data.state, "");
    assert.equal(saved.data.urgent, false);
    assert.equal(saved.data.important, false);
    assert.equal(saved.data.blocked, false);
  });
});
