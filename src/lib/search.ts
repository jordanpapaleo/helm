import MiniSearch from "minisearch";
import type { Note } from "../types/note";

interface SearchDoc {
  id: string;
  title: string;
  content: string;
  tags: string;
}

export type NoteIndex = MiniSearch<SearchDoc>;

export function buildIndex(notes: Note[]): NoteIndex {
  const index = new MiniSearch<SearchDoc>({
    fields: ["title", "content", "tags"],
    storeFields: ["id"],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
    },
  });

  index.addAll(
    notes.map((n) => ({
      id: n.id,
      title: n.frontmatter.title,
      content: n.content,
      tags: n.frontmatter.tags.join(" "),
    })),
  );

  return index;
}

export function searchNotes(index: NoteIndex, notes: Note[], query: string): Note[] {
  if (!query.trim()) return [];
  const results = index.search(query);
  return results
    .slice(0, 20)
    .map((r) => notes.find((n) => n.id === r.id))
    .filter((n): n is Note => n !== undefined);
}
