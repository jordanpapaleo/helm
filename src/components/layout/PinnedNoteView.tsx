import Placeholder from "@tiptap/extension-placeholder";
import type { EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  type FocusEvent as ReactFocusEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { readEditorDraft, subscribeEditorDrafts } from "../../lib/editor-draft";
import { decideEditorSync } from "../../lib/git-sync";
import { normalizeContent } from "../../lib/note-parser";
import { registerSaveFlusher, unregisterSaveFlusher } from "../../lib/pending-saves";
import { saveNoteContent } from "../../lib/save-note";
import { useGitSyncStore } from "../../store/git-sync";
import { useNoteStore } from "../../store/notes";
import { useSettingsStore } from "../../store/settings";
import type { Note } from "../../types/note";
import { BlockCommands } from "../editor/BlockCommands";
import { richCodeBlock } from "../editor/CodeBlockView";
import { ClearMarksOnEnter, HeadingKeyboardFix } from "../editor/editor-keyboard";
import {
  CodeBlockGapCursor,
  getEditorMarkdown,
  handleTextPaste,
  markdownExtensions,
} from "../editor/extensions";
import { InlineTagExtension } from "../editor/InlineTag";
import { MermaidSourceExtension } from "../editor/MermaidSource";

function useLiveDraft(noteId: string): string | undefined {
  return useSyncExternalStore(
    subscribeEditorDrafts,
    () => readEditorDraft(noteId),
    () => readEditorDraft(noteId),
  );
}

/**
 * Editable body for one pinned note.
 *
 * Keyboard shortcuts match the main editor. The property row, toolbar, and
 * status line stay on the main note. This pane does not register a draft
 * reader: when the same note is open in the main editor, that reader is the
 * main editor's, and replacing it would hide those unsaved keystrokes.
 */
function PinnedNoteBody({
  note,
  live,
  held,
  saved,
}: {
  note: Note;
  live: string | undefined;
  held: string | undefined;
  saved: string;
}) {
  const title = note.frontmatter.title || "Untitled";
  const locked = note.frontmatter.locked === true;
  const initialTextRef = useRef(live ?? held ?? saved);
  const appliedRef = useRef(initialTextRef.current);
  const lastSavedRef = useRef(saved);
  const editingRef = useRef(false);
  const heldByUs = useRef(false);
  const applyingExternal = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteIdRef = useRef(note.id);
  noteIdRef.current = note.id;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const autoSaveRef = useRef(true);
  autoSaveRef.current = useSettingsStore((state) => state.settings.autoSaveOnEdit);

  const extensions = useRef([
    ...markdownExtensions(richCodeBlock()),
    Placeholder.configure({ placeholder: "Start writing…" }),
    ClearMarksOnEnter,
    HeadingKeyboardFix,
    CodeBlockGapCursor,
    MermaidSourceExtension,
    BlockCommands,
    InlineTagExtension,
  ]).current;

  const editorProps = useRef({
    attributes: {
      class: "prose max-w-none w-full min-h-16 text-[var(--color-text)] outline-none",
      style: ["font-size: var(--editor-font-size)", "line-height: var(--editor-line-height)"].join(
        "; ",
      ),
      "aria-label": `${title} content`,
    },
    handlePaste(view: EditorView, event: ClipboardEvent) {
      const text = event.clipboardData?.getData("text/plain");
      if (handleTextPaste(view, text)) {
        event.preventDefault();
        return true;
      }
      return false;
    },
  }).current;

  const editor = useEditor({
    extensions,
    editorProps,
    content: initialTextRef.current,
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  const triggerSave = useCallback(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor || currentEditor.isDestroyed || lockedRef.current) return;
    const id = noteIdRef.current;
    const markdown = getEditorMarkdown(currentEditor);
    const current = useNoteStore.getState().notes.find((item) => item.id === id);
    if (!current) return;
    if (normalizeContent(markdown) === normalizeContent(current.content)) {
      const liveNow = readEditorDraft(id);
      const heldNow = useGitSyncStore.getState().heldDraft(id);
      const next = liveNow ?? heldNow ?? current.content;
      if (normalizeContent(next) === normalizeContent(markdown)) editingRef.current = false;
      return;
    }
    const vaultPath =
      useNoteStore.getState().vaults.find((vault) => vault.id === current.vaultId)?.path ?? null;
    if (!useGitSyncStore.getState().isWriteBlocked(id, vaultPath)) {
      // Set before the store update so the echo of our own save is not treated
      // as an external rewrite that should replace the caret.
      lastSavedRef.current = markdown;
    }
    return saveNoteContent(current, markdown);
  }, []);

  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(!locked);
    editor.view.dom.setAttribute("aria-label", `${title} content`);
  }, [editor, locked, title]);

  useEffect(() => {
    if (!editor) return;
    const markdown = getEditorMarkdown(editor);
    const fileMoved = normalizeContent(saved) !== normalizeContent(lastSavedRef.current);

    if (fileMoved) {
      const decision = decideEditorSync({
        dirtySinceFlush: editingRef.current,
        flushedContent: lastSavedRef.current,
        incomingContent: saved,
      });
      if (decision === "hold") {
        const store = useGitSyncStore.getState();
        store.preserveHeldDraft(note.id, markdown);
        store.holdNote(note.id);
        heldByUs.current = true;
        return;
      }
      if (decision === "adopt-incoming") {
        const next = live ?? held ?? saved;
        if (normalizeContent(markdown) !== normalizeContent(next)) {
          applyingExternal.current = true;
          editor.commands.setContent(next, { emitUpdate: false });
          applyingExternal.current = false;
        }
        appliedRef.current = next;
        lastSavedRef.current = saved;
        editingRef.current = false;
        if (heldByUs.current) {
          useGitSyncStore.getState().releaseNote(note.id);
          heldByUs.current = false;
        }
        return;
      }
      lastSavedRef.current = saved;
      if (live === undefined || normalizeContent(live) === normalizeContent(markdown)) {
        editingRef.current = false;
      }
      appliedRef.current = live ?? held ?? saved;
      return;
    }

    if (editingRef.current) {
      const caughtUp = live === undefined || normalizeContent(live) === normalizeContent(markdown);
      const heldBehind =
        held !== undefined && normalizeContent(held) !== normalizeContent(markdown);
      if (caughtUp && !heldBehind) editingRef.current = false;
      return;
    }

    const next = live ?? held ?? saved;
    if (appliedRef.current === next) return;
    if (normalizeContent(markdown) === normalizeContent(next)) {
      appliedRef.current = next;
      return;
    }
    applyingExternal.current = true;
    editor.commands.setContent(next, { emitUpdate: false });
    applyingExternal.current = false;
    appliedRef.current = next;
  }, [editor, live, held, saved, note.id]);

  useEffect(() => {
    if (!editor) return;
    const handler = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (applyingExternal.current || !transaction.docChanged) return;
      editingRef.current = true;
      if (lockedRef.current || !autoSaveRef.current) return;
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

  useEffect(() => {
    return () => {
      if (!heldByUs.current) return;
      const current = editorRef.current;
      const id = noteIdRef.current;
      if (current && !current.isDestroyed) {
        useGitSyncStore.getState().preserveHeldDraft(id, getEditorMarkdown(current));
      }
      useGitSyncStore.getState().releaseNote(id);
      heldByUs.current = false;
    };
  }, []);

  const flusherId = useId();
  useEffect(() => {
    registerSaveFlusher(flusherId, {
      isPending: () => saveTimeoutRef.current !== null,
      flush: async () => {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        await triggerSave();
      },
    });
    return () => unregisterSaveFlusher(flusherId);
  }, [flusherId, triggerSave]);

  const handleBlur = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      triggerSave();
    },
    [triggerSave],
  );

  return (
    <article
      aria-label={`Pinned note ${title}`}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      onBlur={locked ? undefined : handleBlur}
    >
      <h2 className="mb-3 break-words text-lg font-semibold text-[var(--color-text)]">{title}</h2>
      <EditorContent editor={editor} />
    </article>
  );
}

/** One pinned note. It follows that note, not the editor selection. */
export function PinnedNoteView({ noteId }: { noteId: string }) {
  const note = useNoteStore((state) => state.notes.find((item) => item.id === noteId));
  const live = useLiveDraft(noteId);
  const held = useGitSyncStore((state) => state.heldDrafts[noteId]);
  const saved = note?.content ?? "";
  if (!note) return null;
  return <PinnedNoteBody key={note.id} note={note} live={live} held={held} saved={saved} />;
}
