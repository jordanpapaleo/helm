/** DaisyUI status dot with its text label. */
export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`status ${connected ? "status-success" : "status-neutral"}`}
      />
      {connected ? "Connected" : "Not connected"}
    </span>
  );
}
