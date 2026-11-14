import assert from "node:assert/strict";
import { $ } from "@wdio/globals";
import { readNoteFile, waitForNoteFile } from "../support/files.js";
import { writeRaw } from "../support/notes.js";
import { prepareWindow } from "../support/ui.js";

describe("note ids", () => {
  before(async () => {
    await prepareWindow();
  });

  it("writes an id back when a file arrives without one", async () => {
    const vault = process.env.HELM_E2E_VAULT;
    writeRaw(
      vault,
      "fresh.md",
      "---\ntitle: 'Fresh Note'\ncreated: '2026-03-13T09:14:22Z'\nupdated: '2026-03-13T09:14:22Z'\nstate: Prepare\ntags: []\n---\n\nArrived later.\n",
    );
    await $("button*=Fresh Note").waitForDisplayed({ timeout: 15000 });
    const saved = await waitForNoteFile(
      "fresh.md",
      (note) => typeof note.data.id === "string" && note.data.id.length > 0,
      "the watcher did not write an id",
    );
    assert.notEqual(saved.data.id, "e2e-anchor");
    assert.equal(readNoteFile("anchor.md").data.id, "e2e-anchor");
  });
});
