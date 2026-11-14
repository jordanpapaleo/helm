import { $, expect } from "@wdio/globals";
import { openNote, prepareWindow } from "../support/ui.js";

describe("bundled icons", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Alpha");
  });

  it("renders the heading icons from the bundled set", async () => {
    const pin = await $('button[aria-label="Pin to side"]');
    await expect(pin).toBeDisplayed();
    await expect(pin.$("svg")).toBeExisting();
    await expect($('button[aria-label="Unmanaged"] svg')).toBeExisting();
  });
});
