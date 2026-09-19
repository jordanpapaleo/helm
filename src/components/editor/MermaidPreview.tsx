import { useEffect, useState } from "react";
import { renderMermaid } from "../../lib/mermaid";
import { useThemeStore } from "../../store/theme";

const RENDER_DEBOUNCE_MS = 300;

interface MermaidPreviewProps {
  source: string;
  onActivate: () => void;
}

export function MermaidPreview({ source, onActivate }: MermaidPreviewProps) {
  const scheme = useThemeStore((s) => s.theme.colorScheme);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!source.trim()) {
      setSvg(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      renderMermaid(source, scheme).then(
        (out) => {
          if (cancelled) return;
          setSvg(out);
          setError(null);
        },
        (e: unknown) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : String(e));
        },
      );
    }, RENDER_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, scheme]);

  if (!source.trim()) return null;

  return (
    // biome-ignore lint/a11y/useSemanticElements: a <button> cannot contain block SVG layout
    <div
      className="mermaid-preview"
      contentEditable={false}
      role="button"
      tabIndex={-1}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter") onActivate();
      }}
      title="Click to edit diagram source"
    >
      {svg ? (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid sanitises its output (securityLevel "strict")
        <div className="mermaid-preview-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : !error ? (
        <div className="mermaid-preview-status">Rendering diagram…</div>
      ) : null}
      {error && <div className="mermaid-preview-error">{error}</div>}
    </div>
  );
}
