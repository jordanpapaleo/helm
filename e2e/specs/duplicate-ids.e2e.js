import { $, expect } from "@wdio/globals";
import { prepareWindow } from "../support/ui.js";

describe("duplicate ids", () => {
  before(async () => {
    await prepareWindow();
  });

  it("keeps the earliest copy and offers to review the extra file", async () => {
    await expect($("button*=Kept Copy")).toBeDisplayed();
    await expect($("button*=Extra Copy")).not.toBeExisting();
    await expect($("body")).toHaveText(
      expect.stringContaining("1 note ID is used by more than one file."),
    );
    await $("button=Review duplicates").click();
    await expect($('button[aria-label="Close duplicate note IDs"]')).toBeDisplayed();
    await expect($("body")).toHaveText(expect.stringContaining("Extra Copy"));
  });
});
