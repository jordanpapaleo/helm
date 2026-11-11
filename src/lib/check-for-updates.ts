import { tauriCommands } from "./tauri-commands";
import { RELEASES_LATEST_API_URL, UPDATER_MANIFEST_URL } from "./updater-manifest.mjs";

/**
 * Read a GitHub update document from the app backend.
 *
 * The webview's `fetch` throws on the updater manifest. That URL redirects to
 * `release-assets.githubusercontent.com`, which sends no CORS header, so the
 * failure is neither an HTTP status nor a down network. The backend follows
 * the redirect and returns the status. A failed connection still rejects, and
 * the callers report that as a network error.
 */
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function createUpdateFetch(
  read: (url: string) => Promise<{ status: number; body: string }>,
): typeof fetch {
  return async (input: RequestInfo | URL) => {
    const document = await read(requestUrl(input));
    return new Response(document.body, { status: document.status });
  };
}

const appUpdateFetch = createUpdateFetch((url) => tauriCommands.fetchUpdateDocument(url));

export type UpdateCheckResult =
  | { status: "up-to-date"; current: string; latest: string }
  | { status: "update-available"; current: string; latest: string; htmlUrl: string }
  | { status: "error"; current?: string; message: string };

/** Strip leading `v` and any prerelease/build suffix; parse major.minor.patch. */
export function parseVersion(raw: string): [number, number, number] | null {
  const cleaned = raw.trim().replace(/^v/i, "").split(/[-+]/)[0] ?? "";
  const parts = cleaned.split(".");
  if (parts.length < 3) return null;
  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = Number(parts[2]);
  if (![major, minor, patch].every((n) => Number.isInteger(n) && n >= 0)) return null;
  return [major, minor, patch];
}

/** Negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i++) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    const diff = a - b;
    if (diff !== 0) return diff;
  }
  return 0;
}

export function compareWithLatest(
  current: string,
  tagName: string,
  htmlUrl: string,
): UpdateCheckResult {
  const latest = tagName.trim().replace(/^v/i, "");
  const cmp = compareVersions(current, tagName);
  if (cmp === null) {
    return {
      status: "error",
      current,
      message: `Could not parse version from latest release tag "${tagName}".`,
    };
  }
  if (cmp < 0) {
    return { status: "update-available", current, latest, htmlUrl };
  }
  return { status: "up-to-date", current, latest };
}

type LatestReleaseJson = {
  tag_name?: string;
  html_url?: string;
};

export async function checkForUpdates(
  getVersion: () => Promise<string>,
  fetchImpl: typeof fetch = appUpdateFetch,
): Promise<UpdateCheckResult> {
  let current: string;
  try {
    current = await getVersion();
  } catch (e) {
    return {
      status: "error",
      message: e instanceof Error ? e.message : "Could not read the current app version.",
    };
  }

  let response: Response;
  try {
    response = await fetchImpl(RELEASES_LATEST_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });
  } catch {
    return {
      status: "error",
      current,
      message: "Could not reach GitHub to check for updates. Check your network connection.",
    };
  }

  if (!response.ok) {
    return {
      status: "error",
      current,
      message: `GitHub returned ${response.status} while checking for updates.`,
    };
  }

  let data: LatestReleaseJson;
  try {
    data = (await response.json()) as LatestReleaseJson;
  } catch {
    return {
      status: "error",
      current,
      message: "Could not parse the GitHub releases response.",
    };
  }

  if (!data.tag_name || !data.html_url) {
    return {
      status: "error",
      current,
      message: "Latest release is missing a tag or URL.",
    };
  }

  return compareWithLatest(current, data.tag_name, data.html_url);
}

export type UpdateFlowResult =
  | { status: "up-to-date"; current: string; latest: string }
  | { status: "installed"; current: string; latest: string }
  | { status: "error"; current?: string; message: string };

type UpdaterManifestJson = {
  version?: unknown;
};

function manifestVersion(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const version = (data as UpdaterManifestJson).version;
  return typeof version === "string" && version.trim() ? version : null;
}

/**
 * Compare with GitHub, then install a newer signed release.
 * The version comparison and GitHub status errors stay here. `install` performs
 * the Tauri download, install, and relaunch.
 */
export async function checkAndInstallUpdate(
  getVersion: () => Promise<string>,
  install: (available: { current: string; latest: string; htmlUrl: string }) => Promise<void>,
  fetchImpl: typeof fetch = appUpdateFetch,
): Promise<UpdateFlowResult> {
  const result = await checkForUpdates(getVersion, fetchImpl);
  if (result.status === "error" || result.status === "up-to-date") return result;

  let response: Response;
  try {
    response = await fetchImpl(UPDATER_MANIFEST_URL, {
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    return {
      status: "error",
      current: result.current,
      message: "Could not reach GitHub to check for updates. Check your network connection.",
    };
  }

  if (!response.ok) {
    return {
      status: "error",
      current: result.current,
      message: `GitHub returned ${response.status} while checking for updates.`,
    };
  }

  let version: string | null;
  try {
    version = manifestVersion(await response.json());
  } catch {
    version = null;
  }
  if (!version) {
    return {
      status: "error",
      current: result.current,
      message: "Could not parse the updater manifest.",
    };
  }

  if (compareVersions(result.latest, version) !== 0) {
    return {
      status: "error",
      current: result.current,
      message: `Updater manifest version "${version}" does not match GitHub release v${result.latest}.`,
    };
  }

  try {
    await install(result);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Could not install the update.";
    return {
      status: "error",
      current: result.current,
      message: `Could not install Helm v${result.latest}: ${detail}`,
    };
  }

  return { status: "installed", current: result.current, latest: result.latest };
}

/**
 * Download and install, then relaunch. Pending saves flush before the download
 * and again immediately before relaunch, so keystrokes during the download are
 * written before the process is replaced.
 */
export async function downloadInstallAndRelaunch(
  update: {
    downloadAndInstall: () => Promise<void>;
    close: () => Promise<void>;
  },
  flush: () => Promise<void>,
  relaunch: () => Promise<void>,
): Promise<void> {
  await flush();
  try {
    await update.downloadAndInstall();
  } catch (error) {
    await update.close().catch(() => {});
    throw error;
  }
  await flush();
  await relaunch();
}
