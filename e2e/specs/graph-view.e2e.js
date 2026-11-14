import { $, expect } from "@wdio/globals";
import { goToView, prepareWindow } from "../support/ui.js";

describe("link graph", () => {
  before(async () => {
    await prepareWindow();
    await goToView("Link");
  });

  it("draws the visible notes and explains how links are edited", async () => {
    await expect($("canvas")).toBeDisplayed();
    await expect($("body")).toHaveText(expect.stringContaining("Prepare"));
    await expect($("body")).toHaveText(expect.stringContaining("Drag node"));
    await expect($("body")).toHaveText(expect.stringContaining("Click edge to remove"));
  });
});
