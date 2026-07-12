const RELEASES_LATEST_URL = "https://api.github.com/repos/jordanpapaleo/helm/releases/latest";

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
  fetchImpl: typeof fetch = fetch,
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
    response = await fetchImpl(RELEASES_LATEST_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Helm-Desktop-App",
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
