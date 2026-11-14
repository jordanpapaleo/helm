import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { $, browser, expect } from "@wdio/globals";
import matter from "gray-matter";
import { openNote, prepareWindow } from "../support/ui.js";

function noteFile() {
  const vault = process.env.HELM_E2E_VAULT;
  if (!vault) throw new Error("HELM_E2E_VAULT is not set");
  return join(vault, "managed-note.md");
}

function readFrontmatter() {
  return matter(readFileSync(noteFile(), "utf8")).data;
}

async function waitForFrontmatter(predicate, timeoutMsg) {
  let latest = {};
  await browser.waitUntil(
    async () => {
      latest = readFrontmatter();
      return predicate(latest);
    },
    { timeout: 10000, timeoutMsg: () => `${timeoutMsg}\n${JSON.stringify(latest)}` },
  );
  return latest;
}

describe("unmanaged note", () => {
  before(async () => {
    await prepareWindow();
    await openNote("Managed Note");
  });

  it("marks the open note unmanaged from the heading and clears workflow fields", async () => {
    const before = readFrontmatter();
    assert.equal(before.unmanaged, undefined);
    assert.equal(before.state, "Doing");
    assert.equal(before.urgent, true);
    assert.equal(before.important, true);
    assert.equal(before.blocked, true);

    const propertiesButton = await $('button[aria-label="Properties"]');
    await propertiesButton.click();
    const panel = await $('section[aria-label="Properties"]');
    await panel.waitForDisplayed();
    const unmanagedField = await panel.$('input[aria-label="unmanaged"]');
    await expect(unmanagedField).toBeDisplayed();
    await expect(unmanagedField).not.toBeChecked();

    const heading = await $('button[aria-label="Unmanaged"]');
    await heading.click();
    await expect(heading).toHaveAttribute("aria-pressed", "true");
    await expect(unmanagedField).toBeChecked();
    await expect(panel.$('select[aria-label="state"]')).not.toBeExisting();
    await expect(panel.$('input[aria-label="urgent"]')).not.toBeExisting();
    await expect(panel.$('input[aria-label="important"]')).not.toBeExisting();
    await expect($('select[aria-label="State"]')).not.toBeExisting();
    await expect($('button[aria-label="Urgent"]')).not.toBeExisting();
    await expect($('button[aria-label="Important"]')).not.toBeExisting();
    await expect(panel.$('input[aria-label="blocked"]')).not.toBeChecked();

    const saved = await waitForFrontmatter(
      (data) => data.unmanaged === true,
      "the heading click did not write unmanaged",
    );
    assert.equal(saved.state, "");
    assert.equal(saved.urgent, false);
    assert.equal(saved.important, false);
    assert.equal(saved.blocked, false);
  });
});
