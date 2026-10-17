import { useEffect, useRef } from "react";
import { PANEL_BOUNDS, type Panel } from "../../lib/workspace-layout";

export function PanelSeparator({
  panel,
  width,
  max,
  onPreview,
  onCommit,
}: {
  panel: Panel;
  width: number;
  max: number;
  onPreview: (width: number | null) => void;
  onCommit: (width: number) => void;
}) {
  const drag = useRef<{ x: number; width: number; value: number } | null>(null);
  const restore = useRef<(() => void) | null>(null);
  const previewCallback = useRef(onPreview);
  previewCallback.current = onPreview;
  useEffect(
    () => () => {
      restore.current?.();
      if (drag.current) previewCallback.current(null);
    },
    [],
  );
  const min = PANEL_BOUNDS[panel].min;
  const limit = Math.max(min, Math.min(PANEL_BOUNDS[panel].max, max));
  const clamp = (value: number) => Math.max(min, Math.min(limit, value));
  return (
    // biome-ignore lint/a11y/useSemanticElements: focusable interactive window splitter, not a thematic break
    <div
      role="separator"
      tabIndex={0}
      aria-label={`Resize ${panel === "notes" ? "note list" : panel} panel`}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={limit}
      aria-valuenow={Math.round(width)}
      className="workspace-separator w-1 shrink-0 cursor-col-resize touch-none focus-visible:outline-none"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const value = clamp(
          width + (event.key === "ArrowRight" ? 10 : -10) * (panel === "right" ? -1 : 1),
        );
        if (value !== width) onCommit(value);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || drag.current) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width, value: width };
        const { cursor, userSelect } = document.body.style;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        restore.current = () => {
          document.body.style.cursor = cursor;
          document.body.style.userSelect = userSelect;
        };
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const value = clamp(
          drag.current.width + (event.clientX - drag.current.x) * (panel === "right" ? -1 : 1),
        );
        drag.current.value = value;
        onPreview(value);
      }}
      onPointerUp={(event) => {
        if (!drag.current) return;
        const { value, width: initialWidth } = drag.current;
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        restore.current?.();
        restore.current = null;
        if (value !== initialWidth) onCommit(value);
        onPreview(null);
      }}
      onPointerCancel={() => {
        drag.current = null;
        restore.current?.();
        restore.current = null;
        onPreview(null);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
        restore.current?.();
        restore.current = null;
        onPreview(null);
      }}
    />
  );
}
