import assert from "node:assert/strict";
import { $, expect } from "@wdio/globals";
import { addedMarkdown, visibleMarkdown, waitForNoteFile } from "../support/files.js";
import { goToView, pageText, prepareWindow } from "../support/ui.js";

describe("eisenhower", () => {
  before(async () => {
    await prepareWindow();
    await goToView("Eisenhower");
  });

  it("shows only managed Prepare or Doing notes and creates one in the empty quadrant", async () => {
    await expect($("h2=Eisenhower Matrix")).toBeDisplayed();
    assert.match(await pageText(), /Do Now/);
    await expect($("body")).toHaveText(expect.stringContaining("Drop here"));
    await expect($("body")).not.toHaveText(expect.stringContaining("Already Done"));
    await expect($("body")).not.toHaveText(expect.stringContaining("Loose Card"));
    await expect($("body")).toHaveText(expect.stringContaining("Blocked"));

    const before = visibleMarkdown();
    await $('button[aria-label="New note in Eliminate"]').click();
    await $('[role="menu"][aria-label="New note in Eliminate"]').$("button=Blank").click();
    const [created] = addedMarkdown(before);
    if (!created) throw new Error("no new file was created");
    const saved = await waitForNoteFile(
      created,
      (note) => note.data.urgent === false && note.data.important === false,
      "the quadrant plus did not set the flags",
    );
    assertState(saved.data.state);
  });
});

function assertState(state) {
  if (state !== "Prepare") throw new Error(`expected Prepare, got ${state}`);
}
