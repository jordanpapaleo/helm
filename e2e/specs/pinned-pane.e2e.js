import { $ } from "@wdio/globals";
import { waitForNoteFile } from "../support/files.js";
import { openNote, prepareWindow, replaceSelection } from "../support/ui.js";

describe("pinned pane", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("saves an edit made in the side panel", async () => {
    await $('button[aria-label="Pin to side"]').click();
    const side = await $('[aria-label="Alpha content"]');
    await side.waitForDisplayed();
    await side.click();
    await replaceSelection("Edited from the side");
    await waitForNoteFile(
      "alpha.md",
      (note) => note.content.includes("Edited from the side"),
      "the side panel edit was not saved",
    );
  });
});
