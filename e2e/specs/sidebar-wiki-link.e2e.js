import { $, browser, expect } from "@wdio/globals";
import { openNote, prepareWindow } from "../support/ui.js";

async function noteMenu() {
  return $('section[aria-label="Note links"]');
}

async function typeWikiTrigger(element) {
  await element.click();
  // The menu opens at the start of a line or after a space, not after a period.
  // WebKitWebDriver also drops the second bracket when both are one keys() call.
  await browser.keys("Enter");
  await browser.keys("[");
  await browser.keys("[");
  const menu = await noteMenu();
  await menu.waitForDisplayed({ timeout: 5000 });
  return menu;
}

// WebKit's getText skips the selected row: its label is white on the accent.
async function menuLabel(menu) {
  return browser.execute((node) => node.textContent ?? "", menu);
}

describe("sidebar wiki link", () => {
  before(async () => {
    await prepareWindow();
  });

  it("opens the linked note from the side panel and still suggests notes when [[ is typed", async () => {
    await openNote("Alpha");
    await $('button[aria-label="Pin to side"]').click();
    const side = await $('[aria-label="Alpha content"]');
    await side.waitForDisplayed({ timeout: 10000 });

    await side.$(".wikilink-ref").click();
    await browser.waitUntil(async () => (await $("h1").getText()) === "Beta", {
      timeout: 10000,
      timeoutMsg: "clicking [[Beta]] in the side panel did not open Beta",
    });
    await expect(await noteMenu()).not.toBeExisting();

    const main = await $(".ProseMirror:not([aria-label])");
    const mainMenu = await typeWikiTrigger(main);
    await expect(await menuLabel(mainMenu)).toContain("Alpha");
    await browser.keys("Escape");
    await expect(await noteMenu()).not.toBeExisting();

    const more = await side.$("p=More text");
    const sideMenu = await typeWikiTrigger(more);
    await expect(await menuLabel(sideMenu)).toContain("Beta");
  });
});
