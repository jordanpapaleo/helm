import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { readEditorDraft, subscribeEditorDrafts } from "../../lib/editor-draft";
import { useNoteStore } from "../../store/notes";
import type { Note } from "../../types/note";
import { richCodeBlock } from "../editor/CodeBlockView";
import { markdownExtensions } from "../editor/extensions";
import { InlineTagExtension } from "../editor/InlineTag";

function usePinnedBody(noteId: string, saved: string): string {
  return useSyncExternalStore(
    subscribeEditorDrafts,
    () => readEditorDraft(noteId) ?? saved,
    () => readEditorDraft(noteId) ?? saved,
  );
}

function PinnedNoteBody({ note, body }: { note: Note; body: string }) {
  const title = note.frontmatter.title || "Untitled";
  const editor = useEditor({
    extensions: [...markdownExtensions(richCodeBlock()), InlineTagExtension],
    content: body,
    editable: false,
    editorProps: {
      attributes: {
        class: "prose max-w-none w-full text-[var(--color-text)]",
        "aria-label": `${title} content`,
      },
    },
  });
  const applied = useRef(body);
  useEffect(() => {
    if (!editor || applied.current === body) return;
    editor.commands.setContent(body, { emitUpdate: false });
    applied.current = body;
  }, [editor, body]);

  return (
    <article
      aria-label={`Pinned note ${title}`}
      className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
    >
      <h2 className="mb-3 break-words text-lg font-semibold text-[var(--color-text)]">{title}</h2>
      {body.trim() ? (
        <EditorContent editor={editor} />
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">This note is empty.</p>
      )}
    </article>
  );
}

/** Read-only view of one pinned note. It follows that note, not the editor selection. */
export function PinnedNoteView({ noteId }: { noteId: string }) {
  const note = useNoteStore((state) => state.notes.find((item) => item.id === noteId));
  const saved = note?.content ?? "";
  const body = usePinnedBody(noteId, saved);
  if (!note) return null;
  return <PinnedNoteBody key={note.id} note={note} body={body} />;
}
