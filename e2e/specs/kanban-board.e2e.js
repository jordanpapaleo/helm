import assert from "node:assert/strict";
import { $, expect } from "@wdio/globals";
import { addedMarkdown, visibleMarkdown, waitForNoteFile } from "../support/files.js";
import { goToView, prepareWindow } from "../support/ui.js";

describe("kanban", () => {
  before(async () => {
    await prepareWindow();
    await goToView("Kanban");
  });

  it("shows the four columns, hides unmanaged notes, and creates a note in that column", async () => {
    await expect($("h2=Kanban")).toBeDisplayed();
    for (const column of ["Prepare", "Doing", "Maintain", "Done"]) {
      await expect($(`p=${column}`)).toBeDisplayed();
    }
    await expect($("body")).toHaveText(expect.stringContaining("Doing Card"));
    await expect($("body")).not.toHaveText(expect.stringContaining("Loose Card"));

    const before = visibleMarkdown();
    await $('button[aria-label="New note in Doing"]').click();
    const menu = await $('[role="menu"][aria-label="New note in Doing"]');
    await menu.$("button=Blank").click();
    await expect($("h1")).toHaveText("Untitled");
    const [created] = addedMarkdown(before);
    assert.ok(created, "no new file was created");
    const saved = await waitForNoteFile(
      created,
      (note) => note.data.state === "Doing",
      "the column plus did not set Doing",
    );
    assert.equal(saved.data.title, "Untitled");
  });
});
