import { $, expect } from "@wdio/globals";
import { prepareWindow } from "../support/ui.js";

describe("hidden directories", () => {
  before(async () => {
    await prepareWindow();
  });

  it("lists a normal note and hides dot-directories and assets", async () => {
    await expect($("button*=Visible Note")).toBeDisplayed();
    await expect($("button*=Hidden Secret")).not.toBeExisting();
    await expect($("button*=Asset Note")).not.toBeExisting();
  });
});
