import { describe, expect, it, vi } from "vitest";
import { HELM_REPOSITORY_URL, openHelmRepository } from "./helm-repository";

describe("openHelmRepository", () => {
  it("opens the Helm GitHub repository", async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    await openHelmRepository(open);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(HELM_REPOSITORY_URL);
    expect(HELM_REPOSITORY_URL).toBe("https://github.com/jordanpapaleo/helm");
  });

  it("rejects when the browser cannot be opened", async () => {
    const open = vi.fn().mockRejectedValue(new Error("no opener"));
    await expect(openHelmRepository(open)).rejects.toThrow("no opener");
  });
});
