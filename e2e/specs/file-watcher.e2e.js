import { $ } from "@wdio/globals";
import { writeRaw } from "../support/notes.js";
import { prepareWindow } from "../support/ui.js";

describe("file watcher", () => {
  before(async () => {
    await prepareWindow();
  });

  it("shows a markdown file that arrives after the vault is open", async () => {
    writeRaw(
      process.env.HELM_E2E_VAULT,
      "arrived.md",
      "---\nid: e2e-arrived\ntitle: 'Arrived Later'\ncreated: '2026-03-13T09:14:22Z'\nupdated: '2026-03-13T09:14:22Z'\nstate: Prepare\ntags: []\n---\n\nFrom outside.\n",
    );
    await $("button*=Arrived Later").waitForDisplayed({ timeout: 15000 });
  });
});
