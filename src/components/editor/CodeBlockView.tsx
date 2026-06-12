import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { useRef, useState } from "react";
import { LANGUAGES } from "../../lib/lowlight";

export function CodeBlockView({ node, updateAttributes }: ReactNodeViewProps) {
  const language = (node.attrs.language as string | null) ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = draft
    ? LANGUAGES.filter((l) => l.startsWith(draft.toLowerCase())).slice(0, 8)
    : [];

  function startEdit() {
    setDraft(language);
    setActiveIndex(0);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function select(lang: string) {
    updateAttributes({ language: lang || null });
    setEditing(false);
  }

  function commit() {
    select(draft.trim().toLowerCase());
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      suggestions[activeIndex] ? select(suggestions[activeIndex]) : commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(false);
    }
  }

  return (
    <NodeViewWrapper className="code-block-node-view">
      <div className="code-block-lang-bar" contentEditable={false}>
        {editing ? (
          <div className="code-block-lang-editing">
            <input
              ref={inputRef}
              className="code-block-lang-input"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setActiveIndex(0);
              }}
              onBlur={commit}
              onKeyDown={handleKeyDown}
              placeholder="language"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
            />
            {suggestions.length > 0 && (
              <ul className="code-block-lang-dropdown">
                {suggestions.map((lang, i) => (
                  <li
                    key={lang}
                    className={`code-block-lang-option${i === activeIndex ? " active" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault(); // keeps input focused so blur doesn't fire
                      select(lang);
                    }}
                  >
                    {lang}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <button className="code-block-lang-btn" onClick={startEdit} type="button">
            {language || <span className="code-block-lang-empty">language</span>}
          </button>
        )}
      </div>
      <pre>
        <NodeViewContent />
      </pre>
    </NodeViewWrapper>
  );
}
