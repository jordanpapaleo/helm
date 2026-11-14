import { $, expect } from "@wdio/globals";
import { openNote, prepareWindow } from "../support/ui.js";

describe("rich and markdown mode", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("switches to the raw textarea and returns to rich text when another note opens", async () => {
    await $('button[aria-label="Markdown"]').click();
    const source = await $("textarea");
    await source.waitForDisplayed();
    await expect(source).toHaveValue(expect.stringContaining("Body of alpha."));
    await expect($(".ProseMirror")).not.toBeExisting();

    await openNote("Beta");
    await expect($(".ProseMirror")).toBeDisplayed();
    await expect($("textarea")).not.toBeExisting();
  });
});
