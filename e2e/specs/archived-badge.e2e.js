import { $, expect } from "@wdio/globals";
import { openNote, prepareWindow } from "../support/ui.js";

describe("archived badge", () => {
  before(async () => {
    await prepareWindow();
  });

  it("shows Archived on a note that is already archived", async () => {
    await $('button[aria-label="Archive"]').click();
    await openNote("Old Note");
    await expect($(".badge=Archived")).toBeDisplayed();
  });
});
