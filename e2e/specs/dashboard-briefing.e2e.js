import assert from "node:assert/strict";
import { $, browser, expect } from "@wdio/globals";
import { pageText, prepareWindow } from "../support/ui.js";

describe("dashboard and briefing", () => {
  before(async () => {
    await prepareWindow();
  });

  it("keeps unmanaged and done notes out of the briefing and counts them in the chips", async () => {
    const briefing = await $('[data-testid="daily-briefing"]');
    await expect(briefing).toHaveText(expect.stringContaining("Ship It"));
    await expect(briefing).not.toHaveText(expect.stringContaining("Loose Note"));
    await expect(briefing).not.toHaveText(expect.stringContaining("Finished Note"));
    assert.match(await pageText(), /Overdue/);
    await expect(briefing).toHaveText(expect.stringContaining("Ship It"));

    assert.match(await pageText(), /Loose Note/);
    assert.equal(await rowBadge("Loose Note"), "");
    assert.equal(await rowBadge("Ship It"), "Doing");
    assert.match(await pageText(), /Team Distribution/);
    const total = await $("button*=Total Notes");
    await expect(total).toHaveText(expect.stringContaining("3"));
    await $("button*=Do").click();
    assert.match(await pageText(), /Ship It/);
    await $("button*=Do").click();
    assert.match(await pageText(), /Loose Note/);
  });
});

async function rowBadge(title) {
  return browser.execute((label) => {
    const button = [...document.querySelectorAll('[data-testid="note-list"] button')].find((node) =>
      node.textContent?.includes(label),
    );
    return button?.querySelector('[data-testid="state-badge"]')?.textContent ?? "";
  }, title);
}
