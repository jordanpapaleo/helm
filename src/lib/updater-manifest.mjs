/**
 * Tauri updater manifest published next to each GitHub release.
 * release.sh and Linux CI run this file with Node; the app imports the URLs.
 *
 * Asset URLs are versioned (`/releases/download/vX.Y.Z/`). Publishing a new
 * release does not delete or replace older ones. `latest.json` on each release
 * is what `/releases/latest/download/latest.json` resolves to.
 */

import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const GITHUB_REPOSITORY = "jordanpapaleo/helm";

export const RELEASES_LATEST_API_URL = `https://api.github.com/repos/${GITHUB_REPOSITORY}/releases/latest`;

export const UPDATER_MANIFEST_NAME = "latest.json";

export const UPDATER_MANIFEST_URL = `https://github.com/${GITHUB_REPOSITORY}/releases/latest/download/${UPDATER_MANIFEST_NAME}`;

export const MACOS_UPDATER_PLATFORM = "darwin-aarch64";
export const MACOS_UPDATER_ASSET = "Helm.app.tar.gz";

export const LINUX_UPDATER_PLATFORM = "linux-x86_64";
export const LINUX_UPDATER_ASSET = "Helm_amd64.AppImage";

/** Download URL for one file on one tagged release. */
export function releaseAssetUrl(version, fileName, repo = GITHUB_REPOSITORY) {
  const bare = String(version).trim().replace(/^v/i, "");
  if (!bare) throw new Error("Updater asset URL needs a version.");
  if (!fileName) throw new Error("Updater asset URL needs a file name.");
  return `https://github.com/${repo}/releases/download/v${bare}/${fileName}`;
}

/**
 * @param {{ version: string, notes?: string, pubDate: string, platforms: Record<string, { signature: string, url: string }> }} input
 */
export function buildUpdaterManifest(input) {
  const version = String(input.version).trim().replace(/^v/i, "");
  if (!version) throw new Error("Updater manifest needs a version.");
  const entries = Object.entries(input.platforms ?? {});
  if (entries.length === 0) throw new Error("Updater manifest needs at least one platform.");

  /** @type {Record<string, { signature: string, url: string }>} */
  const platforms = {};
  for (const [target, asset] of entries) {
    const signature = String(asset?.signature ?? "").trim();
    const url = String(asset?.url ?? "").trim();
    if (!signature) throw new Error(`Updater platform ${target} is missing a signature.`);
    if (!url) throw new Error(`Updater platform ${target} is missing a url.`);
    platforms[target] = { signature, url };
  }

  return {
    version,
    notes: input.notes ?? "",
    pub_date: input.pubDate,
    platforms,
  };
}

/**
 * Add or replace one platform on an existing manifest. Other platforms stay.
 * @param {{ version: string, notes?: string, pub_date: string, platforms: Record<string, { signature: string, url: string }> }} manifest
 * @param {string} target
 * @param {{ signature: string, url: string }} asset
 */
export function addUpdaterPlatform(manifest, target, asset) {
  return buildUpdaterManifest({
    version: manifest.version,
    notes: manifest.notes,
    pubDate: manifest.pub_date,
    platforms: { ...manifest.platforms, [target]: asset },
  });
}

/** @param {string} name */
function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) return undefined;
  return process.argv[index + 1];
}

/** @param {string} name */
function required(name) {
  const value = arg(name);
  if (!value) {
    console.error(`Missing ${name}`);
    process.exit(1);
  }
  return value;
}

function writeManifest() {
  const signature = readFileSync(required("--signature"), "utf8");
  const platform = required("--platform");
  const asset = required("--asset");
  const repo = arg("--repo") ?? GITHUB_REPOSITORY;
  const mergePath = arg("--merge");

  let manifest;
  if (mergePath) {
    const existing = JSON.parse(readFileSync(mergePath, "utf8"));
    manifest = addUpdaterPlatform(existing, platform, {
      signature,
      url: releaseAssetUrl(existing.version, asset, repo),
    });
  } else {
    const version = required("--version");
    manifest = buildUpdaterManifest({
      version,
      notes: arg("--notes") ?? `Helm ${version}`,
      pubDate: required("--pub-date"),
      platforms: {
        [platform]: {
          signature,
          url: releaseAssetUrl(version, asset, repo),
        },
      },
    });
  }

  writeFileSync(mergePath ?? required("--out"), `${JSON.stringify(manifest, null, 2)}\n`);
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isDirectRun()) writeManifest();
