# Find & Replace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add VS Code-style find & replace to both the TipTap editor and the raw markdown textarea, triggered by Cmd+F.

**Architecture:** A custom TipTap extension (`findReplaceExtension.ts`) manages ProseMirror decorations and commands for the rich-text editor. A shared `FindReplaceBar` component handles the UI and adapts its behavior to editor mode (TipTap commands) or markdown mode (string search + textarea selection). The bar's open/expanded state is lifted to `MainPanel`, which owns the `Mod-f` keyboard handler.

**Tech Stack:** TipTap v3 (`@tiptap/core`, `@tiptap/pm/*`), React 19, `@iconify/react` for icons, Vitest for tests, Tailwind CSS v4 + CSS custom properties for theming.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/editor/findReplaceExtension.ts` | **Create** | ProseMirror plugin + TipTap extension: state, decorations, commands |
| `src/test/find-replace.test.ts` | **Create** | Unit tests for `findMatchesInDocument` |
| `src/styles/globals.css` | **Modify** | Add `.find-replace-highlight` and `.find-replace-highlight-active` styles |
| `src/components/editor/NoteEditor.tsx` | **Modify** | Add extension, `findOpen` prop, expose `editor` via handle |
| `src/components/editor/FindReplaceBar.tsx` | **Create** | VS Code-style find/replace UI — works in both editor and markdown modes |
| `src/components/layout/MainPanel.tsx` | **Modify** | State, window listener, `forwardRef` on `MarkdownTextarea`, render bar |

---

### Task 1: Write `findReplaceExtension.ts`

**Files:**
- Create: `src/components/editor/findReplaceExtension.ts`

- [ ] **Step 1: Create the file with full implementation**

```ts
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node } from "@tiptap/pm/model";

export interface FindReplacePluginState {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  matches: Array<{ from: number; to: number }>;
  activeMatchIndex: number;
  isOpen: boolean;
}

type FindReplaceAction =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "FIND"; query: string; caseSensitive: boolean; wholeWord: boolean }
  | { type: "NAVIGATE"; direction: 1 | -1 };

export const findReplacePluginKey = new PluginKey<FindReplacePluginState>("findReplace");

export function findMatchesInDocument(
  doc: Node,
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
): Array<{ from: number; to: number }> {
  const matches: Array<{ from: number; to: number }> = [];
  if (!query) return matches;
  const q = caseSensitive ? query : query.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const text = node.text ?? "";
    const haystack = caseSensitive ? text : text.toLowerCase();
    let start = 0;
    let idx: number;
    while ((idx = haystack.indexOf(q, start)) !== -1) {
      if (wholeWord) {
        const before = idx > 0 ? text[idx - 1] : "";
        const after = idx + query.length < text.length ? text[idx + query.length] : "";
        if (/\w/.test(before) || /\w/.test(after)) {
          start = idx + 1;
          continue;
        }
      }
      matches.push({ from: pos + idx, to: pos + idx + query.length });
      start = idx + query.length;
    }
    return true;
  });
  return matches;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    findReplace: {
      openFind: () => ReturnType;
      closeFind: () => ReturnType;
      setFindQuery: (query: string, caseSensitive: boolean, wholeWord: boolean) => ReturnType;
      findNext: () => ReturnType;
      findPrevious: () => ReturnType;
      replaceCurrent: (replacement: string) => ReturnType;
      replaceAllMatches: (replacement: string) => ReturnType;
    };
  }
}

export const FindReplaceExtension = Extension.create({
  name: "findReplace",

  addProseMirrorPlugins() {
    return [
      new Plugin<FindReplacePluginState>({
        key: findReplacePluginKey,
        state: {
          init: (): FindReplacePluginState => ({
            query: "",
            caseSensitive: false,
            wholeWord: false,
            matches: [],
            activeMatchIndex: -1,
            isOpen: false,
          }),
          apply(tr, prev) {
            const action = tr.getMeta(findReplacePluginKey) as FindReplaceAction | undefined;
            if (!action) return prev;
            switch (action.type) {
              case "OPEN":
                return { ...prev, isOpen: true };
              case "CLOSE":
                return { ...prev, isOpen: false, query: "", matches: [], activeMatchIndex: -1 };
              case "FIND": {
                const { query, caseSensitive, wholeWord } = action;
                const matches = query
                  ? findMatchesInDocument(tr.doc, query, caseSensitive, wholeWord)
                  : [];
                return {
                  ...prev,
                  query,
                  caseSensitive,
                  wholeWord,
                  matches,
                  activeMatchIndex: matches.length > 0 ? 0 : -1,
                };
              }
              case "NAVIGATE": {
                if (prev.matches.length === 0) return prev;
                let idx = prev.activeMatchIndex + action.direction;
                if (idx < 0) idx = prev.matches.length - 1;
                if (idx >= prev.matches.length) idx = 0;
                return { ...prev, activeMatchIndex: idx };
              }
            }
          },
        },
        props: {
          decorations(state) {
            const s = findReplacePluginKey.getState(state);
            if (!s?.isOpen || !s.query || s.matches.length === 0) return DecorationSet.empty;
            const decos = s.matches.map((m, i) =>
              Decoration.inline(m.from, m.to, {
                class:
                  i === s.activeMatchIndex
                    ? "find-replace-highlight find-replace-highlight-active"
                    : "find-replace-highlight",
              }),
            );
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },

  addCommands() {
    return {
      openFind:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(findReplacePluginKey, { type: "OPEN" } as FindReplaceAction);
          return true;
        },

      closeFind:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(findReplacePluginKey, { type: "CLOSE" } as FindReplaceAction);
          return true;
        },

      setFindQuery:
        (query, caseSensitive, wholeWord) =>
        ({ tr, dispatch, state }) => {
          const s = findReplacePluginKey.getState(state);
          if (!s?.isOpen) return false;
          if (dispatch)
            tr.setMeta(findReplacePluginKey, {
              type: "FIND",
              query,
              caseSensitive,
              wholeWord,
            } as FindReplaceAction);
          return true;
        },

      findNext:
        () =>
        ({ tr, dispatch, state }) => {
          const s = findReplacePluginKey.getState(state);
          if (!s?.isOpen || s.matches.length === 0) return false;
          if (dispatch) {
            tr.setMeta(findReplacePluginKey, { type: "NAVIGATE", direction: 1 } as FindReplaceAction);
            dispatch(tr);
            setTimeout(() => {
              document
                .querySelector(".find-replace-highlight-active")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 0);
          }
          return true;
        },

      findPrevious:
        () =>
        ({ tr, dispatch, state }) => {
          const s = findReplacePluginKey.getState(state);
          if (!s?.isOpen || s.matches.length === 0) return false;
          if (dispatch) {
            tr.setMeta(findReplacePluginKey, { type: "NAVIGATE", direction: -1 } as FindReplaceAction);
            dispatch(tr);
            setTimeout(() => {
              document
                .querySelector(".find-replace-highlight-active")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 0);
          }
          return true;
        },

      replaceCurrent:
        (replacement) =>
        ({ tr, state, dispatch, editor }) => {
          const s = findReplacePluginKey.getState(state);
          if (!s || s.activeMatchIndex < 0) return false;
          const match = s.matches[s.activeMatchIndex];
          if (!match) return false;
          if (dispatch) {
            tr.insertText(replacement, match.from, match.to);
            dispatch(tr);
            setTimeout(
              () => editor.commands.setFindQuery(s.query, s.caseSensitive, s.wholeWord),
              0,
            );
          }
          return true;
        },

      replaceAllMatches:
        (replacement) =>
        ({ tr, state, dispatch, editor }) => {
          const s = findReplacePluginKey.getState(state);
          if (!s || s.matches.length === 0) return false;
          if (dispatch) {
            [...s.matches].reverse().forEach(({ from, to }) => tr.insertText(replacement, from, to));
            dispatch(tr);
            setTimeout(
              () => editor.commands.setFindQuery(s.query, s.caseSensitive, s.wholeWord),
              0,
            );
          }
          return true;
        },
    };
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/findReplaceExtension.ts
git commit -m "feat: add FindReplaceExtension TipTap extension"
```

---

### Task 2: Write tests for `findMatchesInDocument`

**Files:**
- Create: `src/test/find-replace.test.ts`

- [ ] **Step 1: Write the tests**

`findMatchesInDocument` requires a ProseMirror `Node`. We construct one using a minimal schema rather than spinning up a full TipTap editor — this keeps tests fast and dependency-free.

```ts
import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { findMatchesInDocument } from "../components/editor/findReplaceExtension";

const schema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { content: "text*" },
    text: { group: "inline" },
  },
  marks: {},
});

function makeDoc(text: string) {
  return schema.node("doc", null, [
    schema.node("paragraph", null, text ? [schema.text(text)] : []),
  ]);
}

describe("findMatchesInDocument", () => {
  it("returns empty array for empty query", () => {
    const doc = makeDoc("hello world");
    expect(findMatchesInDocument(doc, "", false, false)).toEqual([]);
  });

  it("finds a single match", () => {
    const doc = makeDoc("hello world");
    const matches = findMatchesInDocument(doc, "world", false, false);
    expect(matches).toHaveLength(1);
    // ProseMirror offsets: doc(0) > paragraph(1) > text starts at 2
    // "hello world" — "world" starts at index 6, so from = 2+6 = 8, to = 8+5 = 13
    expect(matches[0]).toEqual({ from: 8, to: 13 });
  });

  it("finds multiple matches", () => {
    const doc = makeDoc("cat and cat");
    const matches = findMatchesInDocument(doc, "cat", false, false);
    expect(matches).toHaveLength(2);
  });

  it("is case-insensitive by default", () => {
    const doc = makeDoc("Hello HELLO hello");
    const matches = findMatchesInDocument(doc, "hello", false, false);
    expect(matches).toHaveLength(3);
  });

  it("respects caseSensitive=true", () => {
    const doc = makeDoc("Hello HELLO hello");
    const matches = findMatchesInDocument(doc, "hello", true, false);
    expect(matches).toHaveLength(1);
  });

  it("respects wholeWord=true — skips partial matches", () => {
    const doc = makeDoc("cat concatenate cat");
    const matches = findMatchesInDocument(doc, "cat", false, true);
    expect(matches).toHaveLength(2);
  });

  it("respects wholeWord=true — matches at start of string", () => {
    const doc = makeDoc("cat is cool");
    const matches = findMatchesInDocument(doc, "cat", false, true);
    expect(matches).toHaveLength(1);
  });

  it("returns empty when no matches", () => {
    const doc = makeDoc("foo bar");
    expect(findMatchesInDocument(doc, "xyz", false, false)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
npm test src/test/find-replace.test.ts
```

Expected output: `✓ 8 tests pass`

- [ ] **Step 3: Commit**

```bash
git add src/test/find-replace.test.ts
git commit -m "test: add findMatchesInDocument unit tests"
```

---

### Task 3: Add highlight CSS

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Append highlight styles to the end of `globals.css`**

```css
.find-replace-highlight {
  background-color: color-mix(in srgb, var(--color-accent) 20%, transparent);
  border-radius: 2px;
}
.find-replace-highlight-active {
  background-color: color-mix(in srgb, var(--color-accent) 50%, transparent);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/globals.css
git commit -m "style: add find-replace highlight CSS"
```

---

### Task 4: Update `NoteEditor` — add extension, `findOpen` prop, expose editor via handle

**Files:**
- Modify: `src/components/editor/NoteEditor.tsx`

- [ ] **Step 1: Add `FindReplaceExtension` to the extensions array**

In the `useMemo` extensions array (around line 274), add the import at the top of the file and the extension to the array:

Add import at top of file (with other TipTap imports):
```ts
import { FindReplaceExtension } from "./findReplaceExtension";
```

Add to the `extensions` useMemo array after `Markdown.configure(...)`:
```ts
FindReplaceExtension,
```

- [ ] **Step 2: Add `findOpen` prop and sync effect**

Update `NoteEditorProps`:
```ts
interface NoteEditorProps {
  note: Note;
  onSave: (content: string) => void;
  locked?: boolean;
  findOpen?: boolean;
}
```

Update the destructured props in the `forwardRef` function signature:
```ts
({ note, onSave, locked = false, findOpen = false }, ref) => {
```

Add a `useEffect` after the existing effects (around line 491), to sync `findOpen` with the TipTap extension:
```ts
useEffect(() => {
  if (!editor) return;
  if (findOpen) {
    editor.commands.openFind();
  } else {
    editor.commands.closeFind();
  }
}, [editor, findOpen]);
```

- [ ] **Step 3: Expose `editor` via `NoteEditorHandle`**

Update the `NoteEditorHandle` interface:
```ts
export interface NoteEditorHandle {
  focus: () => void;
  getEditor: () => import("@tiptap/react").Editor | null;
}
```

Update `useImperativeHandle` (around line 454):
```ts
useImperativeHandle(
  ref,
  () => ({
    focus: () => editor?.commands.focus("end"),
    getEditor: () => editor ?? null,
  }),
  [editor],
);
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npm run tauri dev 2>&1 | head -30
```

Expected: no TypeScript errors. Ctrl+C after confirming.

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/NoteEditor.tsx
git commit -m "feat: add FindReplaceExtension to NoteEditor, expose editor via handle"
```

---

### Task 5: Add `forwardRef` to `MarkdownTextarea` in `MainPanel.tsx`

**Files:**
- Modify: `src/components/layout/MainPanel.tsx`

- [ ] **Step 1: Convert `MarkdownTextarea` to use `forwardRef` with an imperative handle**

Add `forwardRef` and `useImperativeHandle` to the `MarkdownTextarea` function inside `MainPanel.tsx`. The function currently starts at line 18. Replace the entire `MarkdownTextarea` function with:

```tsx
interface MarkdownTextareaHandle {
  textarea: HTMLTextAreaElement | null;
  replaceContent: (newContent: string) => void;
}

const MarkdownTextarea = forwardRef<
  MarkdownTextareaHandle,
  { content: string; onSave: (md: string) => void; locked?: boolean }
>(function MarkdownTextarea({ content, onSave, locked }, ref) {
  const [value, setValue] = useState(content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    onSave(value);
  }, [onSave, value]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (locked) return;
    const next = e.target.value;
    setValue(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSave(next), 1000);
  };

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      textarea: textareaRef.current,
      replaceContent(newContent: string) {
        setValue(newContent);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => onSave(newContent), 1000);
      },
    }),
    [onSave],
  );

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={handleChange}
      onBlur={flush}
      readOnly={locked}
      spellCheck={false}
      className={`flex-1 resize-none bg-transparent px-12 py-6 outline-none ${locked ? "opacity-75 cursor-not-allowed" : ""}`}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--editor-font-size)",
        lineHeight: "var(--editor-line-height)",
        color: "var(--color-text)",
      }}
    />
  );
});
```

Add `forwardRef` to the import at the top of the file:
```ts
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/MainPanel.tsx
git commit -m "refactor: add forwardRef + replaceContent to MarkdownTextarea"
```

---

### Task 6: Build `FindReplaceBar` component

**Files:**
- Create: `src/components/editor/FindReplaceBar.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Icon } from "@iconify/react";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const runMarkdownFind = useCallback(() => {
    if (mode !== "markdown" || !textareaHandle?.textarea) return;
    const text = textareaHandle.textarea.value;
    const matches = findTextMatches(text, findTerm, caseSensitive, wholeWord);
    setMarkdownMatches(matches);
    setMarkdownMatchIdx(matches.length > 0 ? 0 : -1);
    if (matches.length > 0) {
      textareaHandle.textarea.focus();
      textareaHandle.textarea.setSelectionRange(matches[0].start, matches[0].end);
    }
  }, [findTerm, caseSensitive, wholeWord, mode, textareaHandle]);

  useEffect(() => {
    runMarkdownFind();
  }, [runMarkdownFind]);

  const matchCount = mode === "editor" ? editorMatchState.matchCount : markdownMatches.length;
  const currentMatch = mode === "editor" ? editorMatchState.currentMatch : (markdownMatchIdx >= 0 ? markdownMatchIdx + 1 : 0);

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
      setTimeout(runMarkdownFind, 0);
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

  const actionBtnClass =
    "flex h-5 items-center rounded px-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)]/60 disabled:opacity-30 disabled:pointer-events-none";

  const iconBtnClass =
    "flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-border)]/60 disabled:opacity-30 disabled:pointer-events-none";

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

        <button type="button" onClick={() => setCaseSensitive((v) => !v)} title="Match Case" className={toggleBtnClass(caseSensitive)}>
          Aa
        </button>
        <button type="button" onClick={() => setWholeWord((v) => !v)} title="Whole Word" className={`${toggleBtnClass(wholeWord)} underline`}>
          ab
        </button>

        {findTerm && (
          <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
            {matchCount === 0 ? "No results" : `${currentMatch} of ${matchCount}`}
          </span>
        )}

        <button type="button" onClick={handleFindPrev} disabled={matchCount === 0} title="Previous match" className={iconBtnClass}>
          <Icon icon="uil:angle-up" className="h-4 w-4" />
        </button>
        <button type="button" onClick={handleFindNext} disabled={matchCount === 0} title="Next match" className={iconBtnClass}>
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
          <button type="button" onClick={handleReplaceCurrent} disabled={matchCount === 0} className={actionBtnClass}>
            Replace
          </button>
          <button type="button" onClick={handleReplaceAll} disabled={matchCount === 0} className={actionBtnClass}>
            Replace All
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/FindReplaceBar.tsx
git commit -m "feat: add FindReplaceBar component"
```

---

### Task 7: Wire `MainPanel` — state, keyboard listener, render bar

**Files:**
- Modify: `src/components/layout/MainPanel.tsx`

- [ ] **Step 1: Add imports**

Add to the imports at the top of `MainPanel.tsx`:
```ts
import type { RefObject } from "react";
import { FindReplaceBar } from "../editor/FindReplaceBar";
import type { Editor } from "@tiptap/react";
```

Also add `useRef` to the existing react import if not already present — update the react import line to include it:
```ts
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
```

- [ ] **Step 2: Add find state and refs to `MainPanel`**

Inside `MainPanel()`, after the existing `editorRef` declaration (around line 86), add:

```ts
const [findOpen, setFindOpen] = useState(false);
const [findExpanded, setFindExpanded] = useState(false);
const markdownTextareaRef = useRef<MarkdownTextareaHandle>(null);
const findBarFocusRef = useRef<(() => void) | null>(null);
```

- [ ] **Step 3: Add the `Mod-f` window keydown listener**

Add this `useEffect` inside `MainPanel()`, after the existing `useEffect` that resets markdown mode (around line 95):

```ts
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "f") {
      // Only intercept when a note is open
      if (!selectedNote) return;
      e.preventDefault();
      setFindOpen((open) => {
        if (!open) {
          setFindExpanded(false);
          return true;
        }
        setFindExpanded((exp) => {
          if (!exp) return true;
          // Already fully expanded — focus the find input
          findBarFocusRef.current?.();
          return true;
        });
        return true;
      });
    }
  }
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [selectedNote]);
```

- [ ] **Step 4: Reset find state when switching notes**

Add to the existing `useEffect` that resets `markdownMode` (the one that depends on `selectedNoteId`):

```ts
useEffect(() => {
  setMarkdownMode(settings.defaultNoteView === "markdown");
  setFindOpen(false);
  setFindExpanded(false);
}, [selectedNoteId, settings.defaultNoteView]);
```

- [ ] **Step 5: Pass `findOpen` to `NoteEditor` and `markdownTextareaRef` to `MarkdownTextarea`**

Update the `NoteEditor` JSX (around line 193) to pass `findOpen`:
```tsx
<NoteEditor
  ref={editorRef}
  note={selectedNote}
  onSave={handleSave}
  locked={selectedNote.frontmatter.locked}
  findOpen={findOpen}
/>
```

Update `MarkdownTextarea` JSX (around line 186) to pass the ref:
```tsx
<MarkdownTextarea
  key={selectedNote.id}
  ref={markdownTextareaRef}
  content={selectedNote.content}
  onSave={handleSave}
  locked={selectedNote.frontmatter.locked}
/>
```

- [ ] **Step 6: Render `FindReplaceBar` in the note content wrapper**

The note content div (around line 175) currently looks like:
```tsx
<div className="flex flex-1 flex-col overflow-y-auto">
```

Change it to `relative` so the bar can be absolutely positioned, and add the bar before `<BacklinksPanel>`:
```tsx
<div className="relative flex flex-1 flex-col overflow-y-auto">
  <PropertyPanel ... />
  {markdownMode ? (
    <MarkdownTextarea ... />
  ) : (
    <NoteEditor ... />
  )}
  {findOpen && selectedNote && (
    <FindReplaceBar
      mode={markdownMode ? "markdown" : "editor"}
      editor={markdownMode ? null : (editorRef.current?.getEditor() ?? null)}
      textareaHandle={markdownMode ? markdownTextareaRef.current : null}
      expanded={findExpanded}
      onExpand={() => setFindExpanded(true)}
      onClose={() => {
        setFindOpen(false);
        setFindExpanded(false);
      }}
    />
  )}
  <BacklinksPanel note={selectedNote} />
</div>
```

- [ ] **Step 7: Verify TypeScript compiles and test in the app**

```bash
npm run tauri dev
```

Test the following:
1. Open a note, press Cmd+F → find bar appears at top-right of editor
2. Type a word that appears in the note → matches highlight, count shows
3. Press Enter / click ↓ → cycles to next match
4. Press Shift+Enter / click ↑ → cycles to previous match
5. Press Cmd+F again → replace row expands
6. Type in Replace field, click Replace → replaces current match
7. Click Replace All → replaces all matches
8. Press Esc → bar closes, highlights clear
9. Toggle to markdown mode (click the `</>` button in the toolbar), press Cmd+F → bar works, selection highlights in textarea
10. Replace in markdown mode works

- [ ] **Step 8: Commit**

```bash
git add src/components/layout/MainPanel.tsx
git commit -m "feat: wire FindReplaceBar into MainPanel — Cmd+F find & replace"
```

---

## Self-review notes

- `findReplacePluginKey.getState(editor.state)` returns `null` before the plugin initialises — all reads are guarded with `?.`
- `MarkdownTextareaHandle.textarea` can be `null` on first render since `useImperativeHandle` runs after paint — `textareaHandle?.textarea` guards are in place throughout `FindReplaceBar`
- The `editor` prop to `FindReplaceBar` in editor mode is read at render time from `editorRef.current?.getEditor()`. On first open this could be stale if the ref hasn't populated yet — the `openFind` effect in `FindReplaceBar` depends on `editor` and will re-run if it changes from null to a real instance
- `replaceCurrent` and `replaceAllMatches` call `setFindQuery` in a `setTimeout(0)` to re-scan after the document mutation — this is correct because the ProseMirror state update happens synchronously but the new state needs to be read on the next tick after React reconciles
