import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { isMermaidLanguage } from "../../lib/mermaid";
import { printTheme } from "../../lib/pdf-export";
import { useThemeStore } from "../../store/theme";
import type { Note } from "../../types/note";
import { richCodeBlock } from "./CodeBlockView";
import { markdownExtensions } from "./extensions";
import { InlineTagExtension } from "./InlineTag";
import { MermaidThemeOverride } from "./MermaidPreview";
import { WikiLinkExtension } from "./WikiLink";

interface NotePrintViewProps {
  note: Note;
  /** Called once the note, and every diagram in it, has finished rendering. */
  onReady: () => void;
}

/**
 * A read-only render of a note that only exists in print media, so the
 * platform print engine sees the note as the editor shows it — with none of
 * the app around it and regardless of whether markdown mode is on. Dark
 * themes print on the light palette (see `printTheme`).
 */
export function NotePrintView({ note, onReady }: NotePrintViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const theme = printTheme(useThemeStore((s) => s.theme));
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const editor = useEditor({
    extensions: [...markdownExtensions(richCodeBlock()), InlineTagExtension, WikiLinkExtension],
    content: note.content,
    editable: false,
    editorProps: {
      attributes: {
        class: "prose max-w-none w-full text-[var(--color-text)]",
        style: "font-size: var(--editor-font-size); line-height: var(--editor-line-height)",
      },
    },
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!editor || !root) return;

    let expected = 0;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "codeBlock" && isMermaidLanguage(node.attrs.language)) {
        if (node.textContent.trim()) expected++;
      }
    });

    let settled = false;
    let frame = 0;
    const check = () => {
      if (settled) return;
      if (root.querySelectorAll(".mermaid-preview").length < expected) return;
      if (root.querySelector('.mermaid-preview[data-state="pending"]')) return;
      settled = true;
      observer.disconnect();
      // Fonts and the injected SVGs must be laid out before the page is printed.
      const fonts = document.fonts?.ready ?? Promise.resolve();
      fonts.then(() => {
        frame = requestAnimationFrame(() => onReadyRef.current());
      });
    };
    const observer = new MutationObserver(check);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });
    check();
    return () => {
      settled = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [editor]);

  return createPortal(
    <div ref={rootRef} className="print-root" data-theme={theme.id} aria-hidden="true">
      <h1 className="print-title">{note.frontmatter.title || "Untitled"}</h1>
      <MermaidThemeOverride.Provider value={theme}>
        <EditorContent editor={editor} />
      </MermaidThemeOverride.Provider>
    </div>,
    document.body,
  );
}
