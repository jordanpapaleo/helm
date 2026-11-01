import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Pending = { resolve: () => void };

// A listener counts as registered from the moment listen() is called, like the
// Tauri backend, but its unlisten only arrives when the promise resolves.
const active = new Map<number, string>();
let pending: Pending[] = [];
let autoResolve = true;
let nextId = 0;

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string) => {
    const id = nextId++;
    active.set(id, event);
    return new Promise<() => void>((resolve) => {
      const settle = () => resolve(() => active.delete(id));
      if (autoResolve) settle();
      else pending.push({ resolve: settle });
    });
  }),
}));

const watchVault = vi.fn().mockResolvedValue(undefined);
vi.mock("../lib/tauri-commands", () => ({
  tauriCommands: {
    getVaults: vi.fn().mockResolvedValue([{ id: "v1", name: "vault", path: "/vault" }]),
    getVaultPath: vi.fn().mockResolvedValue(null),
    listNotes: vi.fn().mockResolvedValue([]),
    listFolders: vi.fn().mockResolvedValue([]),
    listProjectFiles: vi.fn().mockResolvedValue([]),
    watchVault: (...a: unknown[]) => watchVault(...a),
  },
}));

vi.mock("../lib/git-sync-runtime", () => ({
  startupVault: vi.fn().mockResolvedValue(undefined),
  noteVaultMutated: vi.fn(),
}));

import { listen } from "@tauri-apps/api/event";
import { useVault } from "./useVault";

function changedListeners(): number {
  return [...active.values()].filter((event) => event === "vault-changed").length;
}

async function waitForListenCalls(count: number) {
  await waitFor(() => expect(vi.mocked(listen).mock.calls.length).toBeGreaterThanOrEqual(count));
}

describe("useVault listeners", () => {
  beforeEach(() => {
    active.clear();
    pending = [];
    autoResolve = true;
    vi.mocked(listen).mockClear();
    watchVault.mockClear();
  });

  it("leaves exactly one vault-changed listener under StrictMode double-mount", async () => {
    const { result } = renderHook(() => useVault(), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitForListenCalls(4);

    expect(changedListeners()).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it("unlistens when cleanup runs before listen() resolves (mount/unmount/mount)", async () => {
    autoResolve = false;

    const first = renderHook(() => useVault());
    await waitForListenCalls(4);
    first.unmount();

    const second = renderHook(() => useVault());
    await waitForListenCalls(8);

    await act(async () => {
      for (const p of pending) p.resolve();
    });

    await waitFor(() => expect(changedListeners()).toBe(1));
    second.unmount();
    await waitFor(() => expect(active.size).toBe(0));
  });

  it("does not register listeners after unmount when init is still loading", async () => {
    const { unmount } = renderHook(() => useVault());
    unmount();
    await waitFor(() => expect(watchVault).toHaveBeenCalled());
    await act(async () => {});

    expect(active.size).toBe(0);
  });
});
