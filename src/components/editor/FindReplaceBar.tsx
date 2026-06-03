import { Icon } from "@iconify/react";
import type { Editor } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { findReplacePluginKey } from "./findReplaceExtension";

interface MarkdownTextareaHandle {
  textarea: HTMLTextAreaElement | null;
  replaceContent: (newContent: string) => void;
}

interface FindReplaceBarProps {
  mode: "editor" | "markdown";
  editor: Editor | null;
  textareaHandle: MarkdownTextareaHandle | null;
  expanded: boolean;
  onExpand: () => void;
  onClose: () => void;
}

function findTextMatches(
  text: string,
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
): Array<{ start: number; end: number }> {
  const results: Array<{ start: number; end: number }> = [];
  if (!query) return results;
  const q = caseSensitive ? query : query.toLowerCase();
  const haystack = caseSensitive ? text : text.toLowerCase();
  let pos = 0;
  let idx: number;
  while ((idx = haystack.indexOf(q, pos)) !== -1) {
    if (wholeWord) {
      const before = idx > 0 ? text[idx - 1] : "";
      const after = idx + query.length < text.length ? text[idx + query.length] : "";
      if (/\w/.test(before) || /\w/.test(after)) {
        pos = idx + 1;
        continue;
      }
    }
    results.push({ start: idx, end: idx + query.length });
    pos = idx + query.length;
  }
  return results;
}

export function FindReplaceBar({
  mode,
  editor,
  textareaHandle,
  expanded,
  onExpand,
  onClose,
}: FindReplaceBarProps) {
  const [findTerm, setFindTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);

  const [markdownMatches, setMarkdownMatches] = useState<Array<{ start: number; end: number }>>([]);
  const [markdownMatchIdx, setMarkdownMatchIdx] = useState(-1);
  const [editorMatchState, setEditorMatchState] = useState({ matchCount: 0, currentMatch: 0 });

  const findInputRef = useRef<HTMLInputElement>(null);

  // Focus find input on mount
  useEffect(() => {
    findInputRef.current?.focus();
    findInputRef.current?.select();
  }, []);

  // Editor mode: open/close extension
  useEffect(() => {
    if (mode !== "editor" || !editor) return;
    editor.commands.openFind();
    return () => {
      editor.commands.closeFind();
    };
  }, [mode, editor]);

  // Editor mode: sync query to extension on every change
  useEffect(() => {
    if (mode !== "editor" || !editor) return;
    editor.commands.setFindQuery(findTerm, caseSensitive, wholeWord);
  }, [findTerm, caseSensitive, wholeWord, mode, editor]);

  // Editor mode: track match count from plugin state
  useEffect(() => {
    if (mode !== "editor" || !editor) return;
    const update = () => {
      const s = findReplacePluginKey.getState(editor.state);
      setEditorMatchState({
        matchCount: s?.matches.length ?? 0,
        currentMatch: s?.matches.length ? s.activeMatchIndex + 1 : 0,
      });
    };
    editor.on("transaction", update);
    update();
    return () => {
      editor.off("transaction", update);
    };
  }, [mode, editor]);

  // Markdown mode: recompute matches on query / option change
  useEffect(() => {
    if (mode !== "markdown" || !textareaHandle?.textarea) return;
    const text = textareaHandle.textarea.value;
    const matches = findTextMatches(text, findTerm, caseSensitive, wholeWord);
    setMarkdownMatches(matches);
    setMarkdownMatchIdx(matches.length > 0 ? 0 : -1);
    if (matches.length > 0) {
      textareaHandle.textarea.setSelectionRange(matches[0].start, matches[0].end);
    }
  }, [findTerm, caseSensitive, wholeWord, mode, textareaHandle]);

  const matchCount = mode === "editor" ? editorMatchState.matchCount : markdownMatches.length;
  const currentMatch =
    mode === "editor"
      ? editorMatchState.currentMatch
      : markdownMatchIdx >= 0
        ? markdownMatchIdx + 1
        : 0;

  const handleFindNext = () => {
    if (mode === "editor") {
      editor?.commands.findNext();
    } else {
      if (markdownMatches.length === 0) return;
      const next = (markdownMatchIdx + 1) % markdownMatches.length;
      setMarkdownMatchIdx(next);
      const m = markdownMatches[next];
      if (m && textareaHandle?.textarea) {
        textareaHandle.textarea.focus();
        textareaHandle.textarea.setSelectionRange(m.start, m.end);
      }
    }
  };

  const handleFindPrev = () => {
    if (mode === "editor") {
      editor?.commands.findPrevious();
    } else {
      if (markdownMatches.length === 0) return;
      const prev = (markdownMatchIdx - 1 + markdownMatches.length) % markdownMatches.length;
      setMarkdownMatchIdx(prev);
      const m = markdownMatches[prev];
      if (m && textareaHandle?.textarea) {
        textareaHandle.textarea.focus();
        textareaHandle.textarea.setSelectionRange(m.start, m.end);
      }
    }
  };

  const handleReplaceCurrent = () => {
    if (mode === "editor") {
      editor?.commands.replaceCurrent(replaceTerm);
    } else {
      if (markdownMatchIdx < 0 || !textareaHandle?.textarea) return;
      const m = markdownMatches[markdownMatchIdx];
      const text = textareaHandle.textarea.value;
      const newContent = text.slice(0, m.start) + replaceTerm + text.slice(m.end);
      textareaHandle.replaceContent(newContent);
      const newMatches = findTextMatches(newContent, findTerm, caseSensitive, wholeWord);
      setMarkdownMatches(newMatches);
      setMarkdownMatchIdx(newMatches.length > 0 ? 0 : -1);
    }
  };

  const handleReplaceAll = () => {
    if (mode === "editor") {
      editor?.commands.replaceAllMatches(replaceTerm);
    } else {
      if (!textareaHandle?.textarea || markdownMatches.length === 0) return;
      const text = textareaHandle.textarea.value;
      let newContent = text;
      [...markdownMatches].reverse().forEach((m) => {
        newContent = newContent.slice(0, m.start) + replaceTerm + newContent.slice(m.end);
      });
      textareaHandle.replaceContent(newContent);
      setMarkdownMatches([]);
      setMarkdownMatchIdx(-1);
    }
  };

  const handleFindKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) handleFindPrev();
      else handleFindNext();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const toggleBtnClass = (active: boolean) =>
    `flex h-5 w-6 items-center justify-center rounded text-xs transition-colors ${
      active
        ? "bg-[var(--color-accent)] text-white"
        : "text-[var(--color-text-muted)] hover:bg-[var(--color-border)]/60"
    }`;

  const iconBtnClass =
    "flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)]/60 disabled:opacity-30 disabled:pointer-events-none";

  const actionBtnClass =
    "flex h-5 items-center rounded px-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)]/60 disabled:opacity-30 disabled:pointer-events-none";

  return (
    <div className="absolute right-4 top-2 z-50 w-[420px] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
      {/* Find row */}
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button
          type="button"
          onClick={onExpand}
          className={iconBtnClass}
          title={expanded ? "Collapse" : "Expand to replace"}
        >
          <Icon
            icon="uil:angle-right"
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </button>

        <input
          ref={findInputRef}
          type="text"
          value={findTerm}
          onChange={(e) => setFindTerm(e.target.value)}
          onKeyDown={handleFindKeyDown}
          placeholder="Find"
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
        />

        <button
          type="button"
          onClick={() => setCaseSensitive((v) => !v)}
          title="Match Case"
          className={toggleBtnClass(caseSensitive)}
        >
          Aa
        </button>
        <button
          type="button"
          onClick={() => setWholeWord((v) => !v)}
          title="Whole Word"
          className={`${toggleBtnClass(wholeWord)} underline`}
        >
          ab
        </button>

        {findTerm && (
          <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
            {matchCount === 0 ? "No results" : `${currentMatch} of ${matchCount}`}
          </span>
        )}

        <button
          type="button"
          onClick={handleFindPrev}
          disabled={matchCount === 0}
          title="Previous match"
          className={iconBtnClass}
        >
          <Icon icon="uil:angle-up" className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleFindNext}
          disabled={matchCount === 0}
          title="Next match"
          className={iconBtnClass}
        >
          <Icon icon="uil:angle-down" className="h-4 w-4" />
        </button>
        <button type="button" onClick={onClose} title="Close" className={iconBtnClass}>
          <Icon icon="uil:times" className="h-4 w-4" />
        </button>
      </div>

      {/* Replace row */}
      {expanded && (
        <div className="flex items-center gap-1 border-t border-[var(--color-border)] px-1.5 py-1">
          <div className="h-5 w-5 shrink-0" />
          <input
            type="text"
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            placeholder="Replace"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
          />
          <button
            type="button"
            onClick={handleReplaceCurrent}
            disabled={matchCount === 0}
            className={actionBtnClass}
          >
            Replace
          </button>
          <button
            type="button"
            onClick={handleReplaceAll}
            disabled={matchCount === 0}
            className={actionBtnClass}
          >
            Replace All
          </button>
        </div>
      )}
    </div>
  );
}
