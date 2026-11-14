import assert from "node:assert/strict";
import { $, expect } from "@wdio/globals";
import { openNote, pageText, prepareWindow } from "../support/ui.js";

describe("backlinks", () => {
  before(async () => {
    await prepareWindow();
  });

  it("lists the note that links here and stays hidden when nothing links", async () => {
    await openNote("Beta");
    assert.match(await pageText(), /Backlinks/);
    await expect($("button*=Alpha")).toBeDisplayed();
    await openNote("Solo");
    assert.equal((await pageText()).includes("Backlinks"), false);
  });
});
