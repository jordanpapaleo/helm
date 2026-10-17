import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  flushPendingSaves,
  flushPendingSavesSettled,
  hasPendingSaves,
  registerSaveFlusher,
  unregisterSaveFlusher,
} from "./pending-saves";

describe("pending-saves registry", () => {
  beforeEach(() => {
    // Reset by unregistering anything tests may have left behind
    unregisterSaveFlusher("a");
    unregisterSaveFlusher("b");
  });

  it("hasPendingSaves is false with no registered flushers", () => {
    expect(hasPendingSaves()).toBe(false);
  });

  it("hasPendingSaves reflects the registered isPending checks", () => {
    registerSaveFlusher("a", { isPending: () => false, flush: vi.fn() });
    expect(hasPendingSaves()).toBe(false);
    registerSaveFlusher("b", { isPending: () => true, flush: vi.fn() });
    expect(hasPendingSaves()).toBe(true);
  });

  it("flushPendingSaves only flushes entries that are pending", async () => {
    const flushA = vi.fn();
    const flushB = vi.fn();
    registerSaveFlusher("a", { isPending: () => false, flush: flushA });
    registerSaveFlusher("b", { isPending: () => true, flush: flushB });
    await flushPendingSaves();
    expect(flushA).not.toHaveBeenCalled();
    expect(flushB).toHaveBeenCalledOnce();
  });

  it("flushPendingSaves awaits async flushers", async () => {
    let settled = false;
    registerSaveFlusher("a", {
      isPending: () => true,
      flush: async () => {
        await new Promise((r) => setTimeout(r, 10));
        settled = true;
      },
    });
    await flushPendingSaves();
    expect(settled).toBe(true);
  });

  it("one failing flusher does not prevent the others", async () => {
    const flushB = vi.fn();
    registerSaveFlusher("a", {
      isPending: () => true,
      flush: () => Promise.reject(new Error("disk full")),
    });
    registerSaveFlusher("b", { isPending: () => true, flush: flushB });
    await expect(flushPendingSaves()).resolves.toBeUndefined();
    expect(flushB).toHaveBeenCalledOnce();
    unregisterSaveFlusher("a");
    unregisterSaveFlusher("b");
    registerSaveFlusher("a", {
      isPending: () => true,
      flush: () => Promise.reject(new Error("disk full")),
    });
    await expect(flushPendingSavesSettled()).resolves.toEqual({ failed: 1 });
  });

  it("unregistered flushers are not called", async () => {
    const flush = vi.fn();
    registerSaveFlusher("a", { isPending: () => true, flush });
    unregisterSaveFlusher("a");
    await flushPendingSaves();
    expect(flush).not.toHaveBeenCalled();
    expect(hasPendingSaves()).toBe(false);
  });
});
