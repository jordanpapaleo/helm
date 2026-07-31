/**
 * Close-request handling for the main window.
 *
 * Tauri prevents the native close as soon as a JS `tauri://close-requested`
 * listener exists (see `manager/window.rs` — `api.prevent_close()` runs before
 * our handler), so once the app registers this handler the window can *only*
 * close if JavaScript finishes the handshake. That makes the handler safety
 * critical: any await inside it that can hang is an await that can make the
 * app impossible to quit. Hence the timeout, the non-latching guard, and the
 * Rust-side watchdog in `src-tauri/src/lib.rs`.
 */

/**
 * Upper bound on the close-time flush of debounced autosaves.
 *
 * The editor autosave debounce is 1s, so 2s is comfortably longer than any
 * genuinely pending write needs — it only expires when a write is wedged
 * (e.g. the webview IPC bridge is dead). Losing at most one debounce window
 * of edits is strictly better than an app the user cannot close.
 */
export const CLOSE_FLUSH_TIMEOUT_MS = 2000;

/** The bit of Tauri's CloseRequestedEvent we depend on. */
export interface CloseRequestedEventLike {
  preventDefault: () => void;
}

export interface CloseHandlerDeps {
  /** Best-effort flush of debounced autosaves. */
  flush: () => Promise<void>;
  /** Quit the whole process (not just this window). */
  exit: () => Promise<void>;
  /** Surface a failure to the user. */
  onError: (message: string, error: unknown) => void;
  /** Override the flush timeout (tests). */
  timeoutMs?: number;
}

/**
 * Resolve when `promise` settles or `ms` elapses, whichever is first.
 * Rejections are swallowed: this races a *best-effort* save, and a failed
 * save must never keep the window open. Individual save paths already report
 * their own errors via `reportError`.
 */
function withTimeout(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  const settled = promise.then(
    () => {},
    () => {},
  );
  return Promise.race([settled, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Build the `onCloseRequested` handler. The invariant it maintains: the user
 * can always close the window, whatever the rest of the frontend is doing.
 */
export function createCloseHandler(deps: CloseHandlerDeps) {
  const timeoutMs = deps.timeoutMs ?? CLOSE_FLUSH_TIMEOUT_MS;
  let closing = false;

  return async function handleCloseRequested(event: CloseRequestedEventLike): Promise<void> {
    // Stop the JS API from merely destroying this window: the hidden
    // quick-capture window would keep the process alive, so we exit instead.
    event.preventDefault();

    if (closing) {
      // An attempt is already in flight — and since the flush is bounded, it
      // can only still be here if `exit` itself is wedged. The user asking
      // again means "just go": skip the flush and re-fire the exit. If the
      // IPC bridge is dead this is a no-op too, and the Rust watchdog (or the
      // second close request Rust also sees) takes over.
      try {
        await deps.exit();
      } catch (e) {
        deps.onError("Failed to quit Helm", e);
      }
      return;
    }

    closing = true;
    try {
      await withTimeout(deps.flush(), timeoutMs);
      await deps.exit();
    } catch (e) {
      deps.onError("Failed to quit Helm", e);
    } finally {
      // Never latch. If this attempt failed, the next close request must run
      // the full sequence again rather than being silently swallowed.
      closing = false;
    }
  };
}
