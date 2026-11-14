import assert from "node:assert/strict";
import { $, browser, expect } from "@wdio/globals";
import { readNoteFile } from "../support/files.js";
import { openNote, openProperties, prepareWindow } from "../support/ui.js";

describe("invalid property values", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Dated Note");
  });

  it("rejects a deadline that is not a real calendar date and leaves the file alone", async () => {
    const panel = await openProperties();
    const deadline = await panel.$('input[aria-label="deadline"]');
    await deadline.setValue("2026-02-31");
    await browser.keys("Enter");
    await expect($("body")).toHaveText(expect.stringContaining("Could not save deadline"));
    assert.equal(readNoteFile("dated.md").data.deadline, "2026-04-02");
    await expect(deadline).toHaveValue("2026-04-02");
  });
});
