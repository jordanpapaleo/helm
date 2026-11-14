import { $, expect } from "@wdio/globals";
import { openNote, prepareWindow } from "../support/ui.js";

describe("back and forward", () => {
  before(async () => {
    await prepareWindow();
  });

  it("returns to the previous note and then forward again", async () => {
    await openNote("Alpha");
    await openNote("Beta");
    await $('button[aria-label="Back"]').click();
    await expect($("h1")).toHaveText("Alpha");
    await $('button[aria-label="Forward"]').click();
    await expect($("h1")).toHaveText("Beta");
  });
});
