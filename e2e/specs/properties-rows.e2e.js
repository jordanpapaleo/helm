import assert from "node:assert/strict";
import { readNoteFile, waitForNoteFile } from "../support/files.js";
import { clearField, openNote, openProperties, prepareWindow } from "../support/ui.js";

describe("properties", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("shows the read-only identity and writes, then clears, a text field", async () => {
    const panel = await openProperties();
    await expectText(panel, "e2e-alpha");
    await expectText(panel, "alpha.md");

    const team = await panel.$('input[aria-label="team"]');
    await team.setValue("Platform");
    await team.click();
    await browserKeys("Enter");
    const saved = await waitForNoteFile(
      "alpha.md",
      (note) => note.data.team === "Platform",
      "team was not saved",
    );
    assert.equal(saved.data.id, "e2e-alpha");

    await clearField(team);
    await browserKeys("Enter");
    await waitForNoteFile(
      "alpha.md",
      (note) => note.data.team === undefined,
      "clearing team left the key in the file",
    );
    assert.equal(readNoteFile("alpha.md").data.state, "Prepare");
  });
});

async function expectText(panel, text) {
  const { expect } = await import("@wdio/globals");
  await expect(panel).toHaveText(expect.stringContaining(text));
}

async function browserKeys(key) {
  const { browser } = await import("@wdio/globals");
  await browser.keys(key);
}
