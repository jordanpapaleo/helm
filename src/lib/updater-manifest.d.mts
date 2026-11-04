export const GITHUB_REPOSITORY: string;
export const RELEASES_LATEST_API_URL: string;
export const UPDATER_MANIFEST_NAME: string;
export const UPDATER_MANIFEST_URL: string;
export const MACOS_UPDATER_PLATFORM: string;
export const MACOS_UPDATER_ASSET: string;
export const LINUX_UPDATER_PLATFORM: string;
export const LINUX_UPDATER_ASSET: string;

export interface UpdaterPlatformAsset {
  signature: string;
  url: string;
}

export interface UpdaterManifest {
  version: string;
  notes: string;
  pub_date: string;
  platforms: Record<string, UpdaterPlatformAsset>;
}

export function releaseAssetUrl(version: string, fileName: string, repo?: string): string;

export function buildUpdaterManifest(input: {
  version: string;
  notes?: string;
  pubDate: string;
  platforms: Record<string, { signature?: string; url?: string }>;
}): UpdaterManifest;

export function addUpdaterPlatform(
  manifest: UpdaterManifest,
  target: string,
  asset: { signature: string; url: string },
): UpdaterManifest;
