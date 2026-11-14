import { writeRaw } from "../support/notes.js";

export function seed(vaultPath) {
  writeRaw(
    vaultPath,
    "a.md",
    "---\nid: e2e-dup\ntitle: 'Kept Copy'\ncreated: '2026-03-01T09:14:22Z'\nupdated: '2026-03-01T09:14:22Z'\nstate: Prepare\ntags: []\n---\n\nKept body.\n",
  );
  writeRaw(
    vaultPath,
    "b-longer-name.md",
    "---\nid: e2e-dup\ntitle: 'Extra Copy'\ncreated: '2026-03-13T09:14:22Z'\nupdated: '2026-03-13T09:14:22Z'\nstate: Prepare\ntags: []\n---\n\nExtra body.\n",
  );
}
