import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { $, browser, expect } from "@wdio/globals";
import { readNoteFile, vaultPath, visibleMarkdown, waitForNoteFile } from "../support/files.js";
import { closeSettings, openSettings, prepareWindow, settingsCheckbox } from "../support/ui.js";

describe("projects", () => {
  before(async () => {
    await prepareWindow();
  });

  it("creates the four categories, an unmanaged main page, and an unmanaged thinking note", async () => {
    await openSettings("General");
    await (await settingsCheckbox("Enable Projects")).click();
    await closeSettings();

    await $('button[aria-label="New project"]').click();
    await $("h2=New project").waitForDisplayed();
    const dialog = await $('[role="dialog"]');
    await dialog.$("input").setValue("Kitchen");
    await dialog.$("button=Create project").click();

    await browser.waitUntil(async () => existsSync(`${vaultPath()}/kitchen/helm-project.json`), {
      timeout: 15000,
      timeoutMsg: "the project metadata was not written",
    });
    for (const folder of ["thinking", "features", "bugs", "context"]) {
      assert.equal(existsSync(`${vaultPath()}/kitchen/${folder}`), true, folder);
    }
    await expect($("h1")).toHaveText("Kitchen");
    const main = visibleMarkdown().find(
      (file) => file.startsWith("kitchen/") && file.endsWith(".md") && file.split("/").length === 2,
    );
    if (!main) throw new Error(`no main page in ${visibleMarkdown().join(", ")}`);
    const page = readNoteFile(main);
    assert.equal(page.data.unmanaged, true);

    await $('button[aria-label="Expand Kitchen"]').click();
    await $('button[aria-label="New note in Kitchen Thinking"]').click();
    await $('[role="menu"][aria-label="New note in Kitchen Thinking"]').$("button=Blank").click();
    const thinking = visibleMarkdown().find((file) => file.startsWith("kitchen/thinking/"));
    if (!thinking) throw new Error("no thinking note was created");
    const note = await waitForNoteFile(
      thinking,
      (item) => item.data.unmanaged === true && item.data.state === "",
      "a thinking note was not created unmanaged",
    );
    assert.equal(note.data.title, "Untitled");

    await $("button=Leave project").click();
    await expect($("h2=Dashboard")).toBeDisplayed();
  });
});
