import { expect } from "@wdio/globals";
import { openNote, openProperties, prepareWindow } from "../support/ui.js";

describe("timestamps", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Dated Note");
  });

  it("shows created as local time and keeps the raw UTC value and a date-only deadline", async () => {
    const panel = await openProperties();
    const created = await panel.$("span[title='2026-03-13T09:14:22Z']");
    await expect(created).toBeDisplayed();
    await expect(created).not.toHaveText("2026-03-13T09:14:22Z");
    const deadline = await panel.$('input[aria-label="deadline"]');
    await expect(deadline).toHaveValue("2026-04-02");
  });
});
