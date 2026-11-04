import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addUpdaterPlatform,
  buildUpdaterManifest,
  LINUX_UPDATER_ASSET,
  LINUX_UPDATER_PLATFORM,
  MACOS_UPDATER_ASSET,
  MACOS_UPDATER_PLATFORM,
  releaseAssetUrl,
  UPDATER_MANIFEST_URL,
} from "./updater-manifest.mjs";

const signature = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZQ==";

describe("releaseAssetUrl", () => {
  it("points at that version's asset", () => {
    expect(releaseAssetUrl("1.2.0", MACOS_UPDATER_ASSET)).toBe(
      "https://github.com/jordanpapaleo/helm/releases/download/v1.2.0/Helm.app.tar.gz",
    );
    expect(releaseAssetUrl("v1.2.0", LINUX_UPDATER_ASSET)).toBe(
      "https://github.com/jordanpapaleo/helm/releases/download/v1.2.0/Helm_amd64.AppImage",
    );
  });
});

describe("buildUpdaterManifest", () => {
  it("embeds the signature and a versioned download url", () => {
    const manifest = buildUpdaterManifest({
      version: "v1.2.0",
      notes: "Helm 1.2.0",
      pubDate: "2026-11-04T00:00:00Z",
      platforms: {
        [MACOS_UPDATER_PLATFORM]: {
          signature: `${signature}\n`,
          url: releaseAssetUrl("1.2.0", MACOS_UPDATER_ASSET),
        },
      },
    });
    expect(manifest).toEqual({
      version: "1.2.0",
      notes: "Helm 1.2.0",
      pub_date: "2026-11-04T00:00:00Z",
      platforms: {
        "darwin-aarch64": {
          signature,
          url: "https://github.com/jordanpapaleo/helm/releases/download/v1.2.0/Helm.app.tar.gz",
        },
      },
    });
  });

  it("rejects a platform with no signature", () => {
    expect(() =>
      buildUpdaterManifest({
        version: "1.2.0",
        pubDate: "2026-11-04T00:00:00Z",
        platforms: { [MACOS_UPDATER_PLATFORM]: { signature: "  ", url: "https://example.com" } },
      }),
    ).toThrow(/signature/);
  });
});

describe("addUpdaterPlatform", () => {
  it("keeps platforms already on the manifest", () => {
    const mac = buildUpdaterManifest({
      version: "1.2.0",
      notes: "Helm 1.2.0",
      pubDate: "2026-11-04T00:00:00Z",
      platforms: {
        [MACOS_UPDATER_PLATFORM]: {
          signature,
          url: releaseAssetUrl("1.2.0", MACOS_UPDATER_ASSET),
        },
      },
    });
    const merged = addUpdaterPlatform(mac, LINUX_UPDATER_PLATFORM, {
      signature: "linux-sig",
      url: releaseAssetUrl("1.2.0", LINUX_UPDATER_ASSET),
    });
    expect(merged.platforms[MACOS_UPDATER_PLATFORM]?.url).toContain("/v1.2.0/");
    expect(merged.platforms[LINUX_UPDATER_PLATFORM]?.signature).toBe("linux-sig");
    expect(merged.version).toBe("1.2.0");
  });
});

describe("updater config and release publishing", () => {
  const config = JSON.parse(readFileSync(`${process.cwd()}/src-tauri/tauri.conf.json`, "utf8")) as {
    plugins: { updater: { pubkey: string; endpoints: string[] } };
  };
  const releaseSh = readFileSync(`${process.cwd()}/release.sh`, "utf8");
  const workflow = readFileSync(`${process.cwd()}/.github/workflows/release.yml`, "utf8");

  it("points the app at the latest.json endpoint and embeds a minisign public key", () => {
    expect(config.plugins.updater.endpoints).toEqual([UPDATER_MANIFEST_URL]);
    const decoded = atob(config.plugins.updater.pubkey);
    expect(decoded.startsWith("untrusted comment: minisign public key:")).toBe(true);
  });

  it("publishes the manifest for the new release and does not delete older ones", () => {
    expect(releaseSh).toContain("latest.json");
    expect(releaseSh).toContain("Helm.app.tar.gz");
    expect(releaseSh).not.toMatch(/gh release delete/);
    expect(releaseSh).not.toMatch(/releases\/delete/);
    expect(workflow).not.toMatch(/gh release delete/);
  });

  it("keeps the Node CLI out of the module the app imports", () => {
    const manifest = readFileSync(`${process.cwd()}/src/lib/updater-manifest.mjs`, "utf8");
    const checker = readFileSync(`${process.cwd()}/src/lib/check-for-updates.ts`, "utf8");
    expect(manifest).not.toMatch(/node:fs|node:url|process\.argv/);
    expect(checker).not.toMatch(/node:fs|write-updater-manifest/);
    expect(releaseSh).toContain("scripts/write-updater-manifest.mjs");
    expect(releaseSh).not.toContain("node src/lib/updater-manifest.mjs");
    expect(workflow).toContain("scripts/write-updater-manifest.mjs");
  });
});
