import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Placeholder from "@tiptap/extension-placeholder";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, Extension, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { lowlight } from "../../lib/lowlight";
import { CodeBlockView } from "./CodeBlockView";
import { CodeBlockGapCursor, handleTextPaste, markdownExtensions } from "./extensions";

// Convert a heading to a paragraph when Backspace is pressed at position 0.
// Without this, pressing Backspace at the start of a heading is a no-op,
// leaving the user unable to demote a heading without switching to raw markdown.
const HeadingKeyboardFix = Extension.create({
  name: "headingKeyboardFix",
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== "heading") return false;
        if ($from.parentOffset !== 0) return false;
        return editor.chain().setParagraph().run();
      },
    };
  },
});

// Clear all marks when pressing Enter outside of lists/code blocks
// so new lines never inherit bold, italic, etc.
const ClearMarksOnEnter = Extension.create({
  name: "clearMarksOnEnter",
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (
          editor.isActive("listItem") ||
          editor.isActive("taskItem") ||
          editor.isActive("codeBlock")
        ) {
          return false;
        }
        // When the line is a code fence (``` or ```lang), explicitly convert the
        // current paragraph to a code block. Input rules only fire on text insertion,
        // not on Enter, so we must handle this ourselves.
        const { $from } = editor.state.selection;
        const fenceMatch = /^```([a-z]*)$/.exec($from.parent.textContent.trim());
        if (fenceMatch) {
          const language = fenceMatch[1];
          return editor
            .chain()
            .command(({ tr, state }) => {
              // Clear the fence text (e.g. "```css") before converting the node
              const { $from } = state.selection;
              tr.delete($from.start(), $from.end());
              return true;
            })
            .setCodeBlock({ language })
            .run();
        }
        return editor.chain().splitBlock().unsetAllMarks().run();
      },
    };
  },
});

import { convertFileSrc } from "@tauri-apps/api/core";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { docPositionToTextOffset, resolveTextOffset } from "../../lib/cursor-position";
import { normalizeContent } from "../../lib/note-parser";
import { registerSaveFlusher, unregisterSaveFlusher } from "../../lib/pending-saves";
import { applyScrollFraction, getScrollFraction } from "../../lib/scroll-fraction";
import { tauriCommands } from "../../lib/tauri-commands";
import { useNoteStore } from "../../store/notes";
import { useSettingsStore } from "../../store/settings";
import { reportError } from "../../store/toast";
import type { Note } from "../../types/note";
import { FindReplaceExtension } from "./findReplaceExtension";
import { InlineTagExtension } from "./InlineTag";
import { WikiLinkExtension } from "./WikiLink";

interface SuggestionPopup {
  items: Note[];
  selectedIndex: number;
  rect: DOMRect;
  command: (props: { label: string }) => void;
}

export interface NoteEditorHandle {
  focus: () => void;
  getEditor: () => import("@tiptap/react").Editor | null;
  /**
   * The caret as a surface-independent text offset — the number of characters a
   * reader sees before it. See `src/lib/cursor-position.ts`.
   */
  getCursorTextOffset: () => number | null;
  /** Move the caret to a text offset and focus the editor. Never throws. */
  setCursorTextOffset: (offset: number) => void;
  /** How far through the document the view is scrolled, 0…1 (see scroll-fraction.ts). */
  getScrollFraction: () => number | null;
}

interface NoteEditorProps {
  note: Note;
  onSave: (content: string) => void | Promise<void>;
  locked?: boolean;
  findOpen?: boolean;
  /**
   * Text offset to place the caret at on mount — used to carry the cursor over
   * from the markdown textarea. Applied once, then ignored.
   */
  initialCursorOffset?: number | null;
  /** Scroll fraction to restore on mount, so the view keeps its place. */
  initialScrollFraction?: number | null;
}

/** Keep a document position inside `doc`, whatever the mapping produced. */
function clampPos(doc: { content: { size: number } }, pos: number): number {
  return Math.min(Math.max(pos, 0), doc.content.size);
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(
  (
    {
      note,
      onSave,
      locked = false,
      findOpen = false,
      initialCursorOffset = null,
      initialScrollFraction = null,
    },
    ref,
  ) => {
    const { vaults, notes } = useNoteStore();
    const { settings } = useSettingsStore();
    const vaultPath = vaults.find((v) => v.id === note.vaultId)?.path ?? null;
    const [popup, setPopup] = useState<SuggestionPopup | null>(null);
    // The element that actually scrolls in editor mode (see scroll-fraction.ts).
    const scrollerRef = useRef<HTMLDivElement>(null);

    // Refs prevent stale closures inside the TipTap extension config
    const notesRef = useRef(notes);
    const autocompleteRef = useRef(settings.autocompleteWikiLinks);
    autocompleteRef.current = settings.autocompleteWikiLinks;
    const autoSaveRef = useRef(settings.autoSaveOnEdit);
    autoSaveRef.current = settings.autoSaveOnEdit;
    notesRef.current = notes;
    const noteIdRef = useRef(note.id);
    noteIdRef.current = note.id;
    const popupRef = useRef(popup);
    popupRef.current = popup;
    const setPopupRef = useRef(setPopup);
    setPopupRef.current = setPopup;
    // Tracks the last content we wrote to disk so we can distinguish our own
    // saves from external file changes (e.g. from Claude Code or MCP server).
    const lastSavedContentRef = useRef(note.content);

    // vaultPath is needed inside handlePaste but must not be captured in the memoized
    // extensions array — keep it in a ref so handlePaste always reads the current value.
    const vaultPathRef = useRef(vaultPath);
    vaultPathRef.current = vaultPath;

    // Captures the content at first render for TipTap initialization.
    // Never updated — we pass this to useEditor so the `content` option is stable
    // across renders (preventing TipTap from calling setOptions on every re-render).
    // Actual content loading after mount / note switches is handled by the note.id effect.
    const initialContentRef = useRef(note.content);

    // Memoize extensions so TipTap sees stable references across renders.
    // Every dynamic value (notes list, settings, popup state) is read via a ref,
    // so it is safe to create this array once on mount.
    const extensions = useMemo(
      () => [
        // Schema + markdown behaviour, shared verbatim with the tests that check
        // the cursor mapping against a real document (see extensions.ts).
        ...markdownExtensions(
          CodeBlockLowlight.extend({
            addNodeView() {
              return ReactNodeViewRenderer(CodeBlockView);
            },
          }).configure({ lowlight }),
        ),
        // Interaction only — none of these adds a node, mark, or markdown spec,
        // so none can change the text of a parsed document. InlineTagExtension
        // only draws decorations over #tags, so it stays out of the shared
        // markdown set that the cursor-mapping tests build from.
        // Adding to this group? Mirror it in INTERACTION_ONLY in
        // src/test/cursor-position-editor.test.ts, which proves the claim above.
        Placeholder.configure({ placeholder: "Start writing…" }),
        ClearMarksOnEnter,
        HeadingKeyboardFix,
        CodeBlockGapCursor,
        InlineTagExtension,
        WikiLinkExtension.configure({
          suggestion: {
            items: ({ query }: { query: string }) =>
              !autocompleteRef.current
                ? []
                : notesRef.current
                    .filter(
                      (n) =>
                        n.id !== noteIdRef.current &&
                        n.frontmatter.title.toLowerCase().includes(query.toLowerCase()),
                    )
                    .slice(0, 8),
            render: () => ({
              onStart(props: SuggestionProps<Note>) {
                const rect = props.clientRect?.();
                if (!rect) return;
                setPopupRef.current({
                  items: props.items,
                  selectedIndex: 0,
                  rect,
                  command: props.command,
                });
              },
              onUpdate(props: SuggestionProps<Note>) {
                const rect = props.clientRect?.();
                setPopupRef.current((prev) =>
                  prev
                    ? {
                        ...prev,
                        items: props.items,
                        rect: rect ?? prev.rect,
                        command: props.command,
                      }
                    : null,
                );
              },
              onKeyDown({ event }: SuggestionKeyDownProps) {
                const curr = popupRef.current;
                if (!curr || curr.items.length === 0) return false;
                if (event.key === "Escape") {
                  setPopupRef.current(null);
                  return true;
                }
                if (event.key === "ArrowDown") {
                  setPopupRef.current({
                    ...curr,
                    selectedIndex: (curr.selectedIndex + 1) % curr.items.length,
                  });
                  return true;
                }
                if (event.key === "ArrowUp") {
                  setPopupRef.current({
                    ...curr,
                    selectedIndex: (curr.selectedIndex - 1 + curr.items.length) % curr.items.length,
                  });
                  return true;
                }
                if (event.key === "Enter") {
                  const n = curr.items[curr.selectedIndex];
                  if (n) curr.command({ label: n.frontmatter.title });
                  setPopupRef.current(null);
                  return true;
                }
                return false;
              },
              onExit() {
                setPopupRef.current(null);
              },
            }),
          },
        }),
        FindReplaceExtension,
      ],
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    // Memoize editorProps so TipTap's compareOptions sees a stable reference each render.
    // All dynamic values (vaultPath) are read through refs, so the empty dep array is safe.
    const editorProps = useMemo(
      () => ({
        attributes: {
          class: "prose max-w-none w-full outline-none min-h-[300px] text-[var(--color-text)]",
          style: [
            "font-size: var(--editor-font-size)",
            "line-height: var(--editor-line-height)",
          ].join("; "),
        },
        // biome-ignore lint/suspicious/noExplicitAny: ProseMirror EditorView type not re-exported by tiptap
        handlePaste(view: any, event: ClipboardEvent) {
          const items = event.clipboardData?.items;

          // Handle image paste
          if (items && vaultPathRef.current) {
            for (const item of Array.from(items)) {
              if (!item.type.startsWith("image/")) continue;
              event.preventDefault();
              const file = item.getAsFile();
              if (!file) continue;
              const ext = item.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
              const filename = `${Date.now()}.${ext}`;
              file.arrayBuffer().then(async (buf) => {
                if (!vaultPathRef.current) return;
                const data = Array.from(new Uint8Array(buf));
                try {
                  const absPath = await tauriCommands.writeAsset(
                    vaultPathRef.current,
                    filename,
                    data,
                  );
                  const src = convertFileSrc(absPath);
                  view.dispatch(
                    view.state.tr.replaceSelectionWith(
                      view.state.schema.nodes.image.create({ src, alt: filename }),
                    ),
                  );
                } catch (e) {
                  reportError("Failed to save image", e);
                }
              });
              return true;
            }
          }

          const text = event.clipboardData?.getData("text/plain");
          if (handleTextPaste(view, text)) {
            event.preventDefault();
            return true;
          }

          return false;
        },
      }),
      [],
    );

    // initialContentRef.current never changes after mount, so TipTap's compareOptions
    // sees a stable `content` value on every render and never calls setOptions.
    // The note.id effect below handles loading content when switching notes.
    const editor = useEditor({
      extensions,
      editorProps,
      content: initialContentRef.current,
    });

    // Placing the caret is a selection-only transaction. TipTap emits `update`
    // only when the doc actually changed, so restoring a cursor can never wake
    // the debounced auto-save.
    //
    // The selection transaction carries `scrollIntoView()`, which is ProseMirror's
    // own minimal scroll: it does nothing when the caret is already visible and
    // otherwise scrolls every ancestor scroller by just the deficit. That is what
    // guarantees the caret ends up on screen no matter how the mapping behaved,
    // so focus does not need to scroll as well.
    const placeCursor = useCallback(
      (offset: number) => {
        if (!editor || editor.isDestroyed) return;
        try {
          const { doc } = editor.state;
          const { pos, clamped } = resolveTextOffset(doc, offset);
          let target = pos;
          if (clamped) {
            // The offset fell outside the document, so it tells us nothing
            // trustworthy. Jumping to the end would strand the reader at the far
            // side of the note; put the caret at the top of whatever the restored
            // view is actually showing instead.
            const box = scrollerRef.current?.getBoundingClientRect();
            const at = box && editor.view.posAtCoords({ left: box.left + 4, top: box.top + 4 });
            if (at) target = at.pos;
          }
          const selection = TextSelection.near(doc.resolve(clampPos(doc, target)));
          editor.view.dispatch(editor.state.tr.setSelection(selection).scrollIntoView());
        } catch (e) {
          reportError("Could not restore the cursor position", e);
          // Still guarantee a visible caret rather than leaving the reader
          // looking at a viewport with no cursor in it.
          editor.commands.scrollIntoView();
        }
        editor.commands.focus(null, { scrollIntoView: false });
      },
      [editor],
    );

    useImperativeHandle(
      ref,
      () => ({
        focus: () => editor?.commands.focus("end"),
        getEditor: () => editor ?? null,
        getCursorTextOffset: () =>
          editor && !editor.isDestroyed
            ? docPositionToTextOffset(editor.state.doc, editor.state.selection.head)
            : null,
        setCursorTextOffset: (offset: number) => placeCursor(offset),
        // The editor's own wrapper is the element that scrolls, not the MainPanel
        // wrapper around it.
        getScrollFraction: () =>
          scrollerRef.current ? getScrollFraction(scrollerRef.current) : null,
      }),
      [editor, placeCursor],
    );

    // Reset editor when switching to a different note.
    // emitUpdate: false — this is a programmatic content load, not a user edit.
    // TipTap v3 emits `update` from setContent by default, which would schedule
    // the debounced auto-save and rewrite the note (bumping `updated`) merely
    // because it was opened.
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally omits editor — re-running on editor instance changes would cause loops
    useEffect(() => {
      if (editor) {
        editor.commands.setContent(note.content, { emitUpdate: false });
        lastSavedContentRef.current = note.content;
      }
    }, [note.id]);

    // Reload editor when the file is updated externally (e.g. by Claude Code or MCP).
    // We distinguish external changes from our own saves by tracking lastSavedContentRef.
    // gray-matter inserts a leading \n when parsing file content back; strip it before
    // comparing so our own save→file-watcher cycle doesn't trigger spurious reloads.
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally omits editor — re-running on editor instance changes would cause loops
    useEffect(() => {
      if (!editor) return;
      if (normalizeContent(note.content) === normalizeContent(lastSavedContentRef.current)) return;
      // Cancel any pending auto-save so it doesn't overwrite the external change
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      // emitUpdate: false — reloading from disk must not look like a user edit.
      editor.commands.setContent(note.content, { emitUpdate: false });
      lastSavedContentRef.current = note.content;
    }, [note.content]);

    // Carry the cursor and the scroll position over from the markdown textarea.
    // The editor mounts fresh on every toggle, so this happens exactly once. It
    // must sit after the content effects above, whose `setContent` would
    // otherwise reset the selection we place.
    //
    // Everything runs in one frame, in this order:
    //   1. restore the reading position, so the view is where the reader left it
    //   2. place the caret, letting ProseMirror scroll it into view *only* if
    //      step 1 did not already show it
    // Waiting a frame matters because node views (code blocks) render after
    // mount, so scrollHeight is not trustworthy before then.
    //
    // The "done" guard is set inside the frame rather than before it: if a
    // re-render cancels the frame first, the effect re-runs and reschedules
    // instead of silently dropping the restore.
    const restoreDoneRef = useRef(false);
    useEffect(() => {
      if (!editor || restoreDoneRef.current) return;
      if (initialCursorOffset === null || initialCursorOffset === undefined) return;
      const frame = requestAnimationFrame(() => {
        if (editor.isDestroyed) return;
        restoreDoneRef.current = true;
        if (scrollerRef.current) applyScrollFraction(scrollerRef.current, initialScrollFraction);
        placeCursor(initialCursorOffset);
      });
      return () => cancelAnimationFrame(frame);
    }, [editor, initialCursorOffset, initialScrollFraction, placeCursor]);

    useEffect(() => {
      if (editor) editor.setEditable(!locked);
    }, [editor, locked]);

    useEffect(() => {
      if (!editor) return;
      if (findOpen) {
        editor.commands.openFind();
      } else {
        editor.commands.closeFind();
      }
    }, [editor, findOpen]);

    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const triggerSave = useCallback(() => {
      if (!editor) return;
      const md =
        (
          editor.storage as { markdown?: { getMarkdown?: () => string } }
        ).markdown?.getMarkdown?.() ?? editor.getText();
      lastSavedContentRef.current = md; // mark as our own save so the file watcher doesn't reload
      return onSave(md);
    }, [editor, onSave]);

    // Auto-save 1s after the user stops typing
    useEffect(() => {
      if (!editor) return;
      const handler = () => {
        if (!autoSaveRef.current) return;
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          saveTimeoutRef.current = null;
          triggerSave();
        }, 1000);
      };
      editor.on("update", handler);
      return () => {
        editor.off("update", handler);
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      };
    }, [editor, triggerSave]);

    // Flush edits still inside the debounce window if the window closes.
    const flusherId = useId();
    useEffect(() => {
      registerSaveFlusher(flusherId, {
        isPending: () => saveTimeoutRef.current !== null,
        flush: () => {
          if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
          }
          return triggerSave();
        },
      });
      return () => unregisterSaveFlusher(flusherId);
    }, [flusherId, triggerSave]);

    const handleBlur = useCallback(() => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      triggerSave();
    }, [triggerSave]);

    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: onBlur bubbles from TipTap's focusable editor content
      <div
        ref={scrollerRef}
        onBlur={locked ? undefined : handleBlur}
        className={`relative flex-1 overflow-y-auto px-12 py-6 ${locked ? "opacity-75 cursor-not-allowed select-none" : ""}`}
      >
        <EditorContent editor={editor} />

        {/* Wiki-link suggestion popup */}
        {popup && popup.items.length > 0 && (
          <div
            className="fixed z-50 min-w-[220px] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
            style={{ top: popup.rect.bottom + 6, left: popup.rect.left }}
          >
            {popup.items.map((n, i) => (
              <button
                type="button"
                key={n.id}
                className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                  i === popup.selectedIndex
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-text)] hover:bg-[var(--color-border)]/50"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep editor focus
                  popup.command({ label: n.frontmatter.title });
                  setPopup(null);
                }}
              >
                <span className="truncate">{n.frontmatter.title || "Untitled"}</span>
                {n.frontmatter.tags.length > 0 && (
                  <span className="ml-auto shrink-0 text-xs opacity-50">
                    {n.frontmatter.tags[0]}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
);
