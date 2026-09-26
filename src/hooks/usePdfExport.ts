import { useCallback, useRef, useState } from "react";
import { pdfFileName } from "../lib/pdf-export";
import { flushPendingSaves } from "../lib/pending-saves";
import { tauriCommands } from "../lib/tauri-commands";
import { useNoteStore } from "../store/notes";
import { reportError, useToastStore } from "../store/toast";
import type { Note } from "../types/note";

export interface PdfExportJob {
  note: Note;
  path: string;
}

/**
 * Drives "Export to PDF": pick a destination, mount `NotePrintView` for
 * `job`, and once it reports ready (`handleReady`) print it to the file.
 * One export at a time; repeated triggers while busy are ignored.
 */
export function usePdfExport() {
  const [job, setJob] = useState<PdfExportJob | null>(null);
  const busyRef = useRef(false);
  const jobRef = useRef(job);
  jobRef.current = job;

  const start = useCallback(async (noteId: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    let started = false;
    try {
      // Edits still inside the autosave debounce belong in the PDF.
      await flushPendingSaves();
      const note = useNoteStore.getState().notes.find((n) => n.id === noteId);
      if (!note) return;
      const path = await tauriCommands.savePdfDialog(pdfFileName(note.frontmatter.title));
      if (!path) return;
      setJob({ note, path });
      started = true;
    } catch (e) {
      reportError("Failed to export PDF", e);
    } finally {
      if (!started) busyRef.current = false;
    }
  }, []);

  const handleReady = useCallback(async () => {
    const current = jobRef.current;
    if (!current) return;
    try {
      const written = await tauriCommands.exportPdf(current.path);
      const name = written.split(/[\\/]/).pop() ?? written;
      useToastStore.getState().showToast(`Exported ${name}`, "info");
    } catch (e) {
      reportError("Failed to export PDF", e);
    } finally {
      busyRef.current = false;
      setJob(null);
    }
  }, []);

  return { job, start, handleReady };
}
