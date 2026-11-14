import assert from "node:assert/strict";
import { $, expect } from "@wdio/globals";
import { openSettings, pageText, prepareWindow } from "../support/ui.js";

describe("sync off by default", () => {
  before(async () => {
    await prepareWindow();
  });

  it("hides the vault sync controls and shows the vault as disabled", async () => {
    await expect($("body")).not.toHaveText(expect.stringContaining("Sync all"));
    await expect($('button[aria-label*="Sync"]')).not.toBeExisting();
    await openSettings("Sync");
    await expect($("body")).toHaveText(expect.stringContaining("Disabled"));
    assert.match(await pageText(), /Fixture/);
  });
});
