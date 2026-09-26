import { useEffect, useRef, useState } from "react";
import { mermaidAriaLabel, renderMermaid } from "../../lib/mermaid";
import { useThemeStore } from "../../store/theme";

const RENDER_DEBOUNCE_MS = 300;

interface MermaidPreviewProps {
  source: string;
  onActivate: () => void;
}

export function MermaidPreview({ source, onActivate }: MermaidPreviewProps) {
  const theme = useThemeStore((s) => s.theme);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only edits are debounced; opening a note should show its diagrams at once.
  const hasRenderedRef = useRef(false);

  useEffect(() => {
    if (!source.trim()) {
      setSvg(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(
      () => {
        renderMermaid(source, theme).then(
          (out) => {
            if (cancelled) return;
            hasRenderedRef.current = true;
            setSvg(out);
            setError(null);
          },
          (e: unknown) => {
            if (cancelled) return;
            hasRenderedRef.current = true;
            setError(e instanceof Error ? e.message : String(e));
          },
        );
      },
      hasRenderedRef.current ? RENDER_DEBOUNCE_MS : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, theme]);

  if (!source.trim()) return null;

  return (
    // Clicking is a mouse shortcut into the source; keyboard users reach it
    // with the arrow keys or the block's "Edit source" button.
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard path described above
    // biome-ignore lint/a11y/noStaticElementInteractions: keyboard path described above
    <div
      className="mermaid-preview"
      contentEditable={false}
      onClick={onActivate}
      title="Click to edit diagram source"
    >
      {svg ? (
        <div
          className="mermaid-preview-svg"
          role="img"
          aria-label={mermaidAriaLabel(source)}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid "strict" output, then DOMPurify (sanitizeMermaidSvg)
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : !error ? (
        <div className="mermaid-preview-status">Rendering diagram…</div>
      ) : null}
      {error && (
        <div className="mermaid-preview-error">
          <p className="mermaid-preview-error-title">Couldn't render this diagram</p>
          <div className="mermaid-preview-error-detail">{error}</div>
        </div>
      )}
    </div>
  );
}
