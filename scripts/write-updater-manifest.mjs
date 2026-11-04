/**
 * Write or merge latest.json. release.sh and Linux CI run this with Node.
 * The app must not import it: it reads process.argv and node:fs.
 */

import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  addUpdaterPlatform,
  buildUpdaterManifest,
  GITHUB_REPOSITORY,
  releaseAssetUrl,
} from "../src/lib/updater-manifest.mjs";

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
