/**
 * Quick-capture note builder — turns raw captured text into a ready-to-write
 * vault note. Pure function; the capture window handles the actual disk write.
 */
import { ulid } from "ulid";
import type { Note } from "../types/note";
import { extractInlineTags, serializeNote, slugify } from "./note-parser";
import { nowTimestamp } from "./timestamps";

const TITLE_MAX = 60;

export interface CaptureNote {
  filePath: string;
  raw: string;
}

export function buildCaptureNote(
  text: string,
  vaultPath: string,
  nowMs: number,
): CaptureNote | null {
  if (!text.trim()) return null;

  const firstLine = text.split("\n").find((l) => l.trim()) ?? "";
  const title = firstLine.trim().slice(0, TITLE_MAX);
  const now = nowTimestamp(new Date(nowMs));
  const id = ulid();

  // Slug + timestamp keeps capture filenames unique even for repeated titles
  const fileName = `${slugify(title) || "capture"}-${nowMs}.md`;
  const filePath = `${vaultPath}/${fileName}`;

  const note: Note = {
    id,
    filePath,
    fileName,
    content: text,
    vaultId: "",
    frontmatter: {
      id,
      title,
      created: now,
      updated: now,
      tags: extractInlineTags(text),
      urgent: false,
      important: false,
      state: "Prepare",
      blocked: false,
      locked: false,
      pinned: false,
      links: [],
    },
  };

  return { filePath, raw: serializeNote(note) };
}
