import assert from "node:assert/strict";
import { $ } from "@wdio/globals";
import { waitForNoteFile } from "../support/files.js";
import { openNote, prepareWindow } from "../support/ui.js";

describe("flag toggles", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Loose Note");
  });

  it("writes pinned and template, and turning unmanaged off only flips that flag", async () => {
    await $('button[aria-label="Pinned"]').click();
    await $('button[aria-label="Template"]').click();
    await $('button[aria-label="Unmanaged"]').click();
    const saved = await waitForNoteFile(
      "loose.md",
      (note) =>
        note.data.unmanaged === false && note.data.pinned === true && note.data.template === true,
      "the flag toggles did not write the note",
    );
    assert.equal(saved.data.state, "");
    assert.equal(saved.data.urgent, false);
  });
});
