import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import type { ReactNodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { LANGUAGES, lowlight } from "../../lib/lowlight";
import { isMermaidLanguage } from "../../lib/mermaid";
import { MermaidPreview } from "./MermaidPreview";

/** The code block the app renders: highlighted, with mermaid previews. */
export function richCodeBlock() {
  return CodeBlockLowlight.extend({
    addNodeView() {
      return ReactNodeViewRenderer(CodeBlockView);
    },
  }).configure({ lowlight });
}

export function CodeBlockView({ node, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  const language = (node.attrs.language as string | null) ?? "";
  const isMermaid = isMermaidLanguage(language);
  // Mermaid source is shown only while the cursor is inside the block.
  const cursorInside = useCursorInside(editor, getPos, node.nodeSize, isMermaid);
  const showSource = !isMermaid || cursorInside || !node.textContent.trim();
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

  function editSource() {
    const pos = getPos();
    if (pos === undefined) return;
    editor
      .chain()
      .focus()
      .setTextSelection(pos + 1)
      .run();
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
          <>
            {!showSource && (
              <button className="code-block-lang-btn" onClick={editSource} type="button">
                Edit source
              </button>
            )}
            <button className="code-block-lang-btn" onClick={startEdit} type="button">
              {language || <span className="code-block-lang-empty">language</span>}
            </button>
          </>
        )}
      </div>
      <pre className={showSource ? undefined : "code-block-source-collapsed"}>
        <NodeViewContent />
      </pre>
      {isMermaid && <MermaidPreview source={node.textContent} onActivate={editSource} />}
    </NodeViewWrapper>
  );
}

function useCursorInside(
  editor: ReactNodeViewProps["editor"],
  getPos: ReactNodeViewProps["getPos"],
  nodeSize: number,
  enabled: boolean,
): boolean {
  const [inside, setInside] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const check = () => {
      const pos = getPos();
      if (pos === undefined) return setInside(false);
      const { from, to } = editor.state.selection;
      setInside(editor.isFocused && from >= pos && to <= pos + nodeSize);
    };
    check();
    editor.on("selectionUpdate", check);
    editor.on("focus", check);
    editor.on("blur", check);
    return () => {
      editor.off("selectionUpdate", check);
      editor.off("focus", check);
      editor.off("blur", check);
    };
  }, [editor, getPos, nodeSize, enabled]);
  return inside;
}
