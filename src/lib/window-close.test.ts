import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { CLOSE_FLUSH_TIMEOUT_MS, createCloseHandler } from "./window-close";

/** A promise that never settles — models a wedged Tauri `invoke`. */
function neverSettles(): Promise<void> {
  return new Promise<void>(() => {});
}

interface MockDeps {
  flush: Mock<() => Promise<void>>;
  exit: Mock<() => Promise<void>>;
  onError: Mock<(message: string, error: unknown) => void>;
}

function makeDeps(overrides: Partial<MockDeps> = {}): MockDeps {
  return {
    flush: vi.fn(() => Promise.resolve()),
    exit: vi.fn(() => Promise.resolve()),
    onError: vi.fn(),
    ...overrides,
  };
}

const event = () => ({ preventDefault: vi.fn() });

describe("createCloseHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("flushes pending saves before exiting on a healthy close", async () => {
    const order: string[] = [];
    const deps = makeDeps({
      flush: vi.fn(async () => {
        order.push("flush");
      }),
      exit: vi.fn(async () => {
        order.push("exit");
      }),
    });
    const handle = createCloseHandler(deps);

    await handle(event());

    expect(order).toEqual(["flush", "exit"]);
    expect(deps.onError).not.toHaveBeenCalled();
  });

  it("prevents the default close so the whole process can be exited", async () => {
    const deps = makeDeps();
    const handle = createCloseHandler(deps);
    const e = event();

    await handle(e);

    expect(e.preventDefault).toHaveBeenCalledOnce();
  });

  it("exits anyway when a flusher never settles", async () => {
    const deps = makeDeps({ flush: vi.fn(neverSettles) });
    const handle = createCloseHandler(deps);

    const done = handle(event());
    expect(deps.exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(CLOSE_FLUSH_TIMEOUT_MS);
    await done;

    expect(deps.exit).toHaveBeenCalledOnce();
  });

  it("exits when a flusher rejects", async () => {
    const deps = makeDeps({ flush: vi.fn(() => Promise.reject(new Error("disk full"))) });
    const handle = createCloseHandler(deps);

    await handle(event());

    expect(deps.exit).toHaveBeenCalledOnce();
  });

  it("does not latch the closing guard after a failed exit", async () => {
    const deps = makeDeps({ exit: vi.fn(() => Promise.reject(new Error("ipc down"))) });
    const handle = createCloseHandler(deps);

    await handle(event());
    expect(deps.onError).toHaveBeenCalledOnce();

    // A second attempt must make progress, not silently no-op.
    await handle(event());
    expect(deps.flush).toHaveBeenCalledTimes(2);
    expect(deps.exit).toHaveBeenCalledTimes(2);
  });

  it("skips the flush and exits immediately on a repeat request while wedged", async () => {
    const deps = makeDeps({ flush: vi.fn(neverSettles), exit: vi.fn(neverSettles) });
    const handle = createCloseHandler(deps);

    void handle(event());
    await vi.advanceTimersByTimeAsync(CLOSE_FLUSH_TIMEOUT_MS);
    expect(deps.exit).toHaveBeenCalledOnce();

    // Second close request: the first attempt is stuck inside exit().
    void handle(event());
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.exit).toHaveBeenCalledTimes(2);
    expect(deps.flush).toHaveBeenCalledOnce();
  });

  it("reports, and does not throw, when a repeat forced exit rejects", async () => {
    const deps = makeDeps({ flush: vi.fn(neverSettles), exit: vi.fn(neverSettles) });
    const handle = createCloseHandler(deps);

    void handle(event());
    await vi.advanceTimersByTimeAsync(CLOSE_FLUSH_TIMEOUT_MS);

    deps.exit.mockImplementationOnce(() => Promise.reject(new Error("ipc down")));
    await expect(handle(event())).resolves.toBeUndefined();
    expect(deps.onError).toHaveBeenCalledOnce();
  });

  it("does not wait longer than the flush timeout before exiting", async () => {
    const deps = makeDeps({
      flush: vi.fn(() => new Promise<void>((r) => setTimeout(r, 60_000))),
    });
    const handle = createCloseHandler(deps);

    const done = handle(event());
    await vi.advanceTimersByTimeAsync(CLOSE_FLUSH_TIMEOUT_MS - 1);
    expect(deps.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await done;

    expect(deps.exit).toHaveBeenCalledOnce();
  });

  it("clears the timeout timer once a flush finishes in time", async () => {
    const deps = makeDeps();
    const handle = createCloseHandler(deps);

    await handle(event());

    // A leftover timer would keep the fake clock non-empty.
    expect(vi.getTimerCount()).toBe(0);
  });
});
