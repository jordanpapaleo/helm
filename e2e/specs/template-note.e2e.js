import assert from "node:assert/strict";
import { $ } from "@wdio/globals";
import { addedMarkdown, readNoteFile, visibleMarkdown, waitForNoteFile } from "../support/files.js";
import { prepareWindow, showAllNotes } from "../support/ui.js";

describe("templates", () => {
  before(async () => {
    await prepareWindow();
    await showAllNotes();
  });

  it("copies the title, body, and tags, and leaves the template file alone", async () => {
    const before = visibleMarkdown();
    await $('button[aria-label="New note"]').click();
    const menu = await $('[role="menu"][aria-label="New note"]');
    await menu.waitForDisplayed();
    await menu.$("button=Bug Report").click();
    const [created] = addedMarkdown(before);
    if (!created) throw new Error(`no new file in ${visibleMarkdown().join(", ")}`);
    const saved = await waitForNoteFile(
      created,
      (note) => note.content.includes("Steps to reproduce.") && note.data.template === false,
      "the template was not instantiated",
    );
    assert.equal(saved.data.title, "Bug Report");
    assert.deepEqual(saved.data.tags, ["bugs"]);
    assert.equal(saved.data.state, "Prepare");
    assert.equal(saved.data.urgent, false);
    assert.equal(saved.data.important, false);
    assert.equal(saved.data.pinned, undefined);
    assert.notEqual(saved.data.id, "e2e-template");

    const template = readNoteFile("bug-report.md");
    assert.equal(template.data.state, "Doing");
    assert.equal(template.data.urgent, true);
    assert.equal(template.content.includes("Steps to reproduce."), true);
  });
});
