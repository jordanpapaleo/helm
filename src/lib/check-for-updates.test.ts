import { describe, expect, it, vi } from "vitest";
import {
  checkAndInstallUpdate,
  checkForUpdates,
  compareVersions,
  compareWithLatest,
  parseVersion,
} from "./check-for-updates";
import { UPDATER_MANIFEST_URL } from "./updater-manifest.mjs";

describe("parseVersion", () => {
  it("parses plain and v-prefixed versions", () => {
    expect(parseVersion("1.0.0")).toEqual([1, 0, 0]);
    expect(parseVersion("v1.2.3")).toEqual([1, 2, 3]);
  });

  it("ignores prerelease and build suffixes", () => {
    expect(parseVersion("v0.0.5-test")).toEqual([0, 0, 5]);
    expect(parseVersion("1.0.0+build")).toEqual([1, 0, 0]);
  });

  it("returns null for malformed tags", () => {
    expect(parseVersion("")).toBeNull();
    expect(parseVersion("1.0")).toBeNull();
    expect(parseVersion("abc")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("compares numerically, not lexicographically", () => {
    expect(compareVersions("1.9.0", "1.10.0")).toBeLessThan(0);
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "v1.0.0")).toBe(0);
  });

  it("returns null when either side is unparseable", () => {
    expect(compareVersions("1.0.0", "nope")).toBeNull();
  });
});

describe("compareWithLatest", () => {
  it("reports update-available when latest is newer", () => {
    expect(compareWithLatest("1.0.0", "v1.1.0", "https://example.com/r")).toEqual({
      status: "update-available",
      current: "1.0.0",
      latest: "1.1.0",
      htmlUrl: "https://example.com/r",
    });
  });

  it("reports up-to-date when current is equal or newer", () => {
    expect(compareWithLatest("1.0.0", "v1.0.0", "https://example.com/r")).toEqual({
      status: "up-to-date",
      current: "1.0.0",
      latest: "1.0.0",
    });
    expect(compareWithLatest("1.0.0", "v0.0.5-test", "https://example.com/r")).toEqual({
      status: "up-to-date",
      current: "1.0.0",
      latest: "0.0.5-test",
    });
  });

  it("reports error for malformed latest tag", () => {
    const result = compareWithLatest("1.0.0", "not-a-version", "https://example.com/r");
    expect(result.status).toBe("error");
  });
});

describe("checkForUpdates", () => {
  it("returns update-available from a mocked GitHub response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: "v1.2.0",
        html_url: "https://github.com/jordanpapaleo/helm/releases/tag/v1.2.0",
      }),
    });

    const result = await checkForUpdates(async () => "1.0.0", fetchImpl as typeof fetch);
    expect(result).toEqual({
      status: "update-available",
      current: "1.0.0",
      latest: "1.2.0",
      htmlUrl: "https://github.com/jordanpapaleo/helm/releases/tag/v1.2.0",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("returns error when fetch fails", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    const result = await checkForUpdates(async () => "1.0.0", fetchImpl as typeof fetch);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.current).toBe("1.0.0");
      expect(result.message).toMatch(/network/i);
    }
  });

  it("returns error when GitHub responds non-OK", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    const result = await checkForUpdates(async () => "1.0.0", fetchImpl as typeof fetch);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("403");
    }
  });
});

const releasePage = "https://github.com/jordanpapaleo/helm/releases/tag/v1.2.0";

function githubRelease(tag = "v1.2.0") {
  return {
    ok: true,
    status: 200,
    json: async () => ({ tag_name: tag, html_url: releasePage }),
  };
}

function updaterManifest(version = "1.2.0") {
  return {
    ok: true,
    status: 200,
    json: async () => ({ version }),
  };
}

describe("checkAndInstallUpdate", () => {
  it("says the app is current and does not install", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(githubRelease("v1.0.0"));
    const install = vi.fn();
    const result = await checkAndInstallUpdate(
      async () => "1.0.0",
      install,
      fetchImpl as typeof fetch,
    );
    expect(result).toEqual({ status: "up-to-date", current: "1.0.0", latest: "1.0.0" });
    expect(install).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("shows a GitHub 403 and does not install", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    const install = vi.fn();
    const result = await checkAndInstallUpdate(
      async () => "1.0.0",
      install,
      fetchImpl as typeof fetch,
    );
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).toContain("403");
    expect(install).not.toHaveBeenCalled();
  });

  it("shows a GitHub error from the updater manifest", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(githubRelease())
      .mockResolvedValueOnce({ ok: false, status: 403 });
    const install = vi.fn();
    const result = await checkAndInstallUpdate(
      async () => "1.0.0",
      install,
      fetchImpl as typeof fetch,
    );
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).toContain("403");
    expect(install).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenLastCalledWith(
      UPDATER_MANIFEST_URL,
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it("downloads and installs when the signed manifest matches the newer release", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(githubRelease())
      .mockResolvedValueOnce(updaterManifest());
    const install = vi.fn().mockResolvedValue(undefined);
    const result = await checkAndInstallUpdate(
      async () => "1.0.0",
      install,
      fetchImpl as typeof fetch,
    );
    expect(result).toEqual({ status: "installed", current: "1.0.0", latest: "1.2.0" });
    expect(install).toHaveBeenCalledWith({
      status: "update-available",
      current: "1.0.0",
      latest: "1.2.0",
      htmlUrl: releasePage,
    });
  });

  it("does not install when the manifest version disagrees with GitHub", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(githubRelease())
      .mockResolvedValueOnce(updaterManifest("1.1.0"));
    const install = vi.fn();
    const result = await checkAndInstallUpdate(
      async () => "1.0.0",
      install,
      fetchImpl as typeof fetch,
    );
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).toMatch(/does not match/);
    expect(install).not.toHaveBeenCalled();
  });

  it("shows the installer error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(githubRelease())
      .mockResolvedValueOnce(updaterManifest());
    const install = vi.fn().mockRejectedValue(new Error("signature rejected"));
    const result = await checkAndInstallUpdate(
      async () => "1.0.0",
      install,
      fetchImpl as typeof fetch,
    );
    expect(result.status).toBe("error");
    if (result.status === "error") expect(result.message).toContain("signature rejected");
  });
});
