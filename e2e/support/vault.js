import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** Shown in the sidebar. Specs click this instead of a path. */
export const VAULT_NAME = "Fixture";

const IDENTIFIER = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")).identifier;

/**
 * Debug binary tauri-driver asks WebKitWebDriver to launch.
 * `npm run test:e2e` builds it first.
 */
export function helmBinary() {
  const name = process.platform === "win32" ? "helm.exe" : "helm";
  return resolve("src-tauri/target/debug", name);
}

export function tauriDriverBin() {
  if (process.env.TAURI_DRIVER) return process.env.TAURI_DRIVER;
  const found = spawnSync("which", ["tauri-driver"], { encoding: "utf8" });
  const line = found.stdout?.trim();
  if (found.status === 0 && line) return line;
  return join(process.env.HOME ?? "", ".cargo", "bin", "tauri-driver");
}

/**
 * Point Helm at a throwaway vault.
 *
 * Vaults live in the Tauri store file `config.json` under the app data
 * directory (`$XDG_DATA_HOME/<identifier>/config.json` on Linux). WebKitWebDriver
 * is what actually execs the binary, so a small launcher sets that directory
 * before Helm starts. The real config and the developer's vault stay untouched.
 *
 * @param {(vaultPath: string) => void} seed
 */
export function prepareVault(seed) {
  const root = mkdtempSync(join(tmpdir(), "helm-e2e-"));
  const vaultPath = join(root, "vault");
  const dataHome = join(root, "data");
  mkdirSync(vaultPath, { recursive: true });
  mkdirSync(join(dataHome, IDENTIFIER), { recursive: true });
  seed(vaultPath);
  writeFileSync(
    join(dataHome, IDENTIFIER, "config.json"),
    JSON.stringify({
      vaults: [{ id: "e2e", name: VAULT_NAME, path: vaultPath }],
    }),
  );

  const launcher = join(root, "launch-helm.sh");
  const binary = helmBinary();
  writeFileSync(
    launcher,
    [
      "#!/bin/sh",
      `export XDG_DATA_HOME='${dataHome}'`,
      `export XDG_CONFIG_HOME='${join(root, "config")}'`,
      `export XDG_CACHE_HOME='${join(root, "cache")}'`,
      `export XDG_STATE_HOME='${join(root, "state")}'`,
      "export GDK_BACKEND=x11",
      "export WEBKIT_DISABLE_DMABUF_RENDERER=1",
      "export WEBKIT_DISABLE_COMPOSITING_MODE=1",
      `exec '${binary}' "$@"`,
      "",
    ].join("\n"),
  );
  chmodSync(launcher, 0o755);
  return { root, vaultPath, launcher };
}

export function removeVault(root) {
  if (root) rmSync(root, { recursive: true, force: true });
}
